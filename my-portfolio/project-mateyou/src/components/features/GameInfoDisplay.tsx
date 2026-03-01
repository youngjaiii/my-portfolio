import { Typography } from '@/components'

interface GameInfo {
  game?: string
  [key: string]: any
}

interface GameInfoDisplayProps {
  gameInfo: Array<GameInfo> | GameInfo | string | null | undefined
}

const formatKey = (key: string): string => {
  // 키를 읽기 쉽게 변환
  const keyMap: Record<string, string> = {
    game: '게임',
    rank: '랭크',
    tier: '티어',
    level: '레벨',
    main: '메인 캐릭터',
    role: '역할',
    favorite_hero: '선호 영웅',
    favorite_character: '선호 캐릭터',
    adventure_rank: '모험 등급',
    style: '스타일',
    worlds: '월드 수',
    avg_kills: '평균 킬',
    farm_type: '농장 타입',
    days_played: '플레이 일수',
    total_games: '총 게임 수',
    win_rate: '승률',
    skins: '스킨 수',
  }

  return keyMap[key] || key
}

const formatValue = (value: any): string => {
  if (typeof value === 'number') {
    // 승률은 퍼센트로 표시
    if (value <= 1 && value > 0) {
      return `${(value * 100).toFixed(1)}%`
    }
    return value.toString()
  }
  return String(value)
}

const getGameIcon = (gameName: string): { emoji: string; color: string } => {
  const gameMap: Record<string, { emoji: string; color: string }> = {
    Valorant: { emoji: '🎯', color: 'from-red-400 to-orange-500' },
    'League of Legends': { emoji: '⚔️', color: 'from-[#a65fc9] to-[#f4a8c2]' },
    Overwatch: { emoji: '🤖', color: 'from-orange-400 to-yellow-500' },
    'Genshin Impact': { emoji: '✨', color: 'from-purple-400 to-pink-500' },
    'Apex Legends': { emoji: '🏆', color: 'from-red-500 to-pink-600' },
    Minecraft: { emoji: '🧱', color: 'from-green-400 to-emerald-500' },
    PUBG: { emoji: '🔫', color: 'from-gray-600 to-gray-800' },
    'Stardew Valley': { emoji: '🌾', color: 'from-green-300 to-lime-400' },
    'Among Us': { emoji: '👾', color: 'from-red-400 to-pink-500' },
    Fortnite: { emoji: '🌪️', color: 'from-[#a65fc9] to-[#f4a8c2]' },
    FIFA: { emoji: '⚽', color: 'from-[#a65fc9] to-[#f4a8c2]' },
    'Call of Duty': { emoji: '💥', color: 'from-gray-700 to-black' },
    'Rocket League': { emoji: '🚗', color: 'from-orange-500 to-red-600' },
    'Dota 2': { emoji: '🏛️', color: 'from-red-600 to-orange-700' },
    'Counter-Strike': { emoji: '🎯', color: 'from-yellow-500 to-orange-600' },
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
  return { emoji: '🎮', color: 'from-[#a65fc9] to-[#f4a8c2]' }
}

const GameInfoCard = ({ gameInfo }: { gameInfo: GameInfo }) => {
  const entries = Object.entries(gameInfo)
  const gameTitle = gameInfo.game || '게임 정보'
  const otherEntries = entries.filter(([key]) => key !== 'game')
  const gameIcon = getGameIcon(gameTitle)

  return (
    <div
      className={`bg-[#FE3A8F] rounded-lg p-4 border border-white/20 shadow-lg`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-lg">
          {gameIcon.emoji}
        </div>
        <Typography
          variant="h6"
          className="font-bold text-white drop-shadow-sm"
        >
          {gameTitle}
        </Typography>
      </div>

      <div className="space-y-2">
        {otherEntries.map(([key, value]) => (
          <div key={key} className="flex justify-between items-center">
            <span className="text-sm text-white/90 font-medium">
              {formatKey(key)}
            </span>
            <span className="text-sm font-semibold text-white bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full">
              {formatValue(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function GameInfoDisplay({ gameInfo }: GameInfoDisplayProps) {
  if (!gameInfo) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 text-center">
        <Typography variant="body2" color="text-secondary">
          게임 정보가 없습니다
        </Typography>
      </div>
    )
  }

  // 문자열인 경우 JSON 파싱 시도
  let parsedGameInfo: Array<GameInfo>
  try {
    if (typeof gameInfo === 'string') {
      parsedGameInfo = JSON.parse(gameInfo)
    } else if (Array.isArray(gameInfo)) {
      parsedGameInfo = gameInfo
    } else {
      parsedGameInfo = [gameInfo]
    }
  } catch (error) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 text-center">
        <Typography variant="body2" color="text-secondary">
          게임 정보를 불러올 수 없습니다
        </Typography>
      </div>
    )
  }

  if (!Array.isArray(parsedGameInfo) || parsedGameInfo.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 text-center">
        <Typography variant="body2" color="text-secondary">
          게임 정보가 없습니다
        </Typography>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {parsedGameInfo.map((game, index) => (
        <GameInfoCard key={index} gameInfo={game} />
      ))}
    </div>
  )
}
