import { Button, Flex, Input, Textarea, Typography } from '@/components'

interface GameInfo {
  game: string
  tier: string
  description: string
}

interface GameInfoInputProps {
  value: Array<GameInfo>
  onChange: (gameInfos: Array<GameInfo>) => void
  error?: string
  disabled?: boolean
  readOnly?: boolean
}

export function GameInfoInput({
  value,
  onChange,
  error,
  disabled,
  readOnly,
}: GameInfoInputProps) {
  const addGameInfo = () => {
    onChange([...value, { game: '', tier: '', description: '' }])
  }

  const removeGameInfo = (index: number) => {
    const newGameInfos = value.filter((_, i) => i !== index)
    onChange(newGameInfos)
  }

  const updateGameInfo = (
    index: number,
    field: keyof GameInfo,
    fieldValue: string,
  ) => {
    const newGameInfos = value.map((info, i) =>
      i === index ? { ...info, [field]: fieldValue } : info,
    )
    onChange(newGameInfos)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Typography variant="body2" className="font-medium text-gray-700">
          게임 정보
        </Typography>
        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addGameInfo}
            disabled={disabled}
          >
            + 게임 추가
          </Button>
        )}
      </div>

      {value.length === 0 && (
        <div className="text-center p-8 border-2 border-dashed border-gray-200 rounded-lg">
          <Typography variant="body2" color="text-secondary">
            {readOnly ? '게임 정보가 없습니다' : '게임 정보를 추가해주세요'}
          </Typography>
          {!readOnly && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={addGameInfo}
              disabled={disabled}
              className="mt-2"
            >
              첫 번째 게임 추가
            </Button>
          )}
        </div>
      )}

      {value.map((gameInfo, index) => (
        <div
          key={index}
          className="p-4 border border-gray-200 rounded-lg bg-gray-50"
        >
          <Flex justify="between" align="center" className="mb-4">
            <Typography variant="body2" className="font-medium">
              게임 #{index + 1}
            </Typography>
            {value.length > 1 && !readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeGameInfo(index)}
                disabled={disabled}
                className="text-red-600 hover:text-red-800"
              >
                삭제
              </Button>
            )}
          </Flex>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Input
              label="게임 이름 *"
              type="text"
              placeholder="예: League of Legends"
              value={gameInfo.game}
              onChange={(e) => updateGameInfo(index, 'game', e.target.value)}
              disabled={disabled || readOnly}
              readOnly={readOnly}
            />

            <Input
              label="티어/랭크"
              type="text"
              placeholder="예: Diamond, Gold, 마스터 등"
              value={gameInfo.tier}
              onChange={(e) => updateGameInfo(index, 'tier', e.target.value)}
              disabled={disabled || readOnly}
              readOnly={readOnly}
            />
          </div>

          <Textarea
            label="설명"
            placeholder="예: 메인 포지션 원딜, 플레이 스타일 등을 자유롭게 작성해주세요"
            value={gameInfo.description}
            onChange={(e) =>
              updateGameInfo(index, 'description', e.target.value)
            }
            rows={3}
            disabled={disabled || readOnly}
            readOnly={readOnly}
          />
        </div>
      ))}

      {error && (
        <Typography variant="caption" className="text-red-600">
          {error}
        </Typography>
      )}

      {!readOnly && (
        <Typography variant="caption" color="text-secondary">
          각 게임별로 상세 정보를 입력해주세요. 여러 게임을 추가할 수 있습니다.
        </Typography>
      )}
    </div>
  )
}
