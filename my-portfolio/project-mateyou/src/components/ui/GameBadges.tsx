interface GameBadgesProps {
  favoriteGames: string | null | undefined
  size?: 'sm' | 'md' | 'lg'
  maxDisplay?: number
}

const getGameIcon = (gameName: string): { emoji: string; color: string } => {
  const gameMap: Record<string, { emoji: string; color: string }> = {
    Valorant: {
      emoji: '🎯',
      color: 'bg-gradient-to-r from-red-400 to-orange-500',
    },
    'League of Legends': {
      emoji: '⚔️',
      color: 'bg-gradient-to-r from-[#a65fc9] to-[#f4a8c2]',
    },
    Overwatch: {
      emoji: '🤖',
      color: 'bg-gradient-to-r from-orange-400 to-yellow-500',
    },
    'Genshin Impact': {
      emoji: '✨',
      color: 'bg-gradient-to-r from-purple-400 to-pink-500',
    },
    'Apex Legends': {
      emoji: '🏆',
      color: 'bg-gradient-to-r from-red-500 to-pink-600',
    },
    Minecraft: {
      emoji: '🧱',
      color: 'bg-gradient-to-r from-green-400 to-emerald-500',
    },
    PUBG: { emoji: '🔫', color: 'bg-gradient-to-r from-gray-600 to-gray-800' },
    'Stardew Valley': {
      emoji: '🌾',
      color: 'bg-gradient-to-r from-green-300 to-lime-400',
    },
    'Among Us': {
      emoji: '👾',
      color: 'bg-gradient-to-r from-red-400 to-pink-500',
    },
    Fortnite: {
      emoji: '🌪️',
      color: 'bg-gradient-to-r from-[#a65fc9] to-[#f4a8c2]',
    },
    FIFA: { emoji: '⚽', color: 'bg-gradient-to-r from-[#a65fc9] to-[#f4a8c2]' },
    'Call of Duty': {
      emoji: '💥',
      color: 'bg-gradient-to-r from-gray-700 to-black',
    },
    'Rocket League': {
      emoji: '🚗',
      color: 'bg-gradient-to-r from-orange-500 to-red-600',
    },
    'Dota 2': {
      emoji: '🏛️',
      color: 'bg-gradient-to-r from-red-600 to-orange-700',
    },
    'Counter-Strike': {
      emoji: '🎯',
      color: 'bg-gradient-to-r from-yellow-500 to-orange-600',
    },
    LOL: { emoji: '⚔️', color: 'bg-gradient-to-r from-[#a65fc9] to-[#f4a8c2]' },
    LoL: { emoji: '⚔️', color: 'bg-gradient-to-r from-[#a65fc9] to-[#f4a8c2]' },
  }

  const normalizedName = Object.keys(gameMap).find(
    (key) =>
      key.toLowerCase().includes(gameName.toLowerCase()) ||
      gameName.toLowerCase().includes(key.toLowerCase()),
  )

  if (normalizedName) {
    return gameMap[normalizedName]
  }

  // 기본 아이콘
  return { emoji: '🎮', color: 'bg-[#FE3A8F]' }
}

const getSizeClasses = (size: 'sm' | 'md' | 'lg') => {
  switch (size) {
    case 'sm':
      return {
        container: 'gap-1',
        badge: 'px-2 py-1 text-xs',
        icon: 'text-xs',
        text: 'text-xs',
      }
    case 'md':
      return {
        container: 'gap-2',
        badge: 'px-3 py-1.5 text-sm',
        icon: 'text-sm',
        text: 'text-sm',
      }
    case 'lg':
      return {
        container: 'gap-2',
        badge: 'px-4 py-2 text-base',
        icon: 'text-base',
        text: 'text-base',
      }
  }
}

export function GameBadges({
  favoriteGames,
  size = 'md',
  maxDisplay = 3,
}: GameBadgesProps) {
  if (!favoriteGames || favoriteGames.trim() === '') {
    return <span className="text-gray-400 text-sm italic">게임 정보 없음</span>
  }

  // 쉼표로 구분된 게임들을 분리하고 정리
  const games = favoriteGames
    .split(',')
    .map((game) => game.trim())
    .filter((game) => game.length > 0)

  if (games.length === 0) {
    return <span className="text-gray-400 text-sm italic">게임 정보 없음</span>
  }

  const sizeClasses = getSizeClasses(size)
  const displayGames = games.slice(0, maxDisplay)
  const remainingCount = games.length - maxDisplay

  return (
    <div className={`flex flex-wrap items-center ${sizeClasses.container}`}>
      {displayGames.map((game, index) => {
        const gameIcon = getGameIcon(game)
        return (
          <div
            key={index}
            className={`
              ${gameIcon.color}
              ${sizeClasses.badge}
              rounded-full
              text-white
              font-medium
              shadow-sm
              flex items-center gap-1.5
              hover:shadow-md
              transition-shadow
              duration-200
            `}
          >
            <span className={sizeClasses.icon}>{gameIcon.emoji}</span>
            <span
              className={`${sizeClasses.text} font-semibold drop-shadow-sm`}
            >
              {game}
            </span>
          </div>
        )
      })}

      {remainingCount > 0 && (
        <div
          className={`
          bg-gray-200
          text-gray-600
          ${sizeClasses.badge}
          rounded-full
          font-medium
          flex items-center
        `}
        >
          <span className={sizeClasses.text}>+{remainingCount}</span>
        </div>
      )}
    </div>
  )
}
