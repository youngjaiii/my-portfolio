import { memo } from 'react'

interface WatermarkedImageProps {
  src: string
  alt?: string
  className?: string
  memberCode?: string
  draggable?: boolean
  loading?: 'lazy' | 'eager'
  style?: React.CSSProperties
  onClick?: () => void
}

export const WatermarkedImage = memo(function WatermarkedImage({
  src,
  alt = '',
  className = '',
  memberCode,
  draggable = false,
  loading = 'lazy',
  style,
  onClick,
}: WatermarkedImageProps) {
  const validMemberCode = memberCode && memberCode !== 'unknown' && memberCode !== 'undefined' ? memberCode : null

  return (
    <div className="relative w-full h-full" onClick={onClick}>
      <img
        src={src}
        alt={alt}
        className={className}
        draggable={draggable}
        loading={loading}
        style={style}
        onContextMenu={(e) => e.preventDefault()}
      />
      {validMemberCode && (
        <div 
          className="absolute inset-0 overflow-hidden pointer-events-none select-none"
          style={{ zIndex: 10 }}
        >
          <div 
            style={{
              position: 'absolute',
              top: '-50%',
              left: '-50%',
              width: '200%',
              height: '200%',
              transform: 'rotate(-30deg)',
              display: 'flex',
              flexWrap: 'wrap',
              alignContent: 'flex-start',
              gap: '40px 45px',
              padding: '20px',
            }}
          >
            {Array.from({ length: 200 }).map((_, i) => (
              <span
                key={i}
                className="text-white font-bold whitespace-nowrap"
                style={{
                  fontSize: '10px',
                  opacity: 0.13,
                  textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
                }}
              >
                @{validMemberCode}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})
