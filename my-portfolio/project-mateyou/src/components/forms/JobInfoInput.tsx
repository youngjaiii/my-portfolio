import { Button, Flex, Input, Typography } from '@/components'

interface ServiceInfo {
  job_name: string
  coins_per_job: number
}

interface ServiceInfoInputProps {
  value: Array<ServiceInfo>
  onChange: (services: Array<ServiceInfo>) => void
  error?: string
  disabled?: boolean
  readOnly?: boolean
}

export function ServiceInfoInput({
  value,
  onChange,
  error,
  disabled,
  readOnly,
}: ServiceInfoInputProps) {
  const addService = () => {
    onChange([...value, { job_name: '', coins_per_job: 0 }])
  }

  const removeService = (index: number) => {
    const newServices = value.filter((_, i) => i !== index)
    onChange(newServices)
  }

  const updateService = (
    index: number,
    field: keyof ServiceInfo,
    fieldValue: string | number,
  ) => {
    const newServices = value.map((service, i) =>
      i === index ? { ...service, [field]: fieldValue } : service,
    )
    onChange(newServices)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Typography variant="body2" className="font-medium text-gray-700">
          제공할 서비스
        </Typography>
        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addService}
            disabled={disabled}
          >
            + 퀘스트 추가
          </Button>
        )}
      </div>

      {value.length === 0 && (
        <div className="text-center p-8 border-2 border-dashed border-gray-200 rounded-lg">
          <Typography variant="body2" color="text-secondary">
            {readOnly
              ? '제공하는 서비스가 없습니다'
              : '제공할 서비스를 추가해주세요'}
          </Typography>
          {!readOnly && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={addService}
              disabled={disabled}
              className="mt-2"
            >
              첫 번째 퀘스트 추가
            </Button>
          )}
        </div>
      )}

      {value.map((service, index) => (
        <div
          key={index}
          className="p-4 border border-gray-200 rounded-lg bg-gray-50"
        >
          <Flex justify="between" align="center" className="mb-4">
            <Typography variant="body2" className="font-medium">
              서비스 #{index + 1}
            </Typography>
            {value.length > 1 && !readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeService(index)}
                disabled={disabled}
                className="text-red-600 hover:text-red-800"
              >
                삭제
              </Button>
            )}
          </Flex>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="서비스명 *"
              type="text"
              placeholder="예: 듀오 대리, 코칭, 아이템 파밍"
              value={service.job_name}
              onChange={(e) => updateService(index, 'job_name', e.target.value)}
              disabled={disabled || readOnly}
              readOnly={readOnly}
            />

            <Input
              label="건당 코인 *"
              type="number"
              placeholder="예: 1000"
              value={service.coins_per_job || ''}
              onChange={(e) =>
                updateService(
                  index,
                  'coins_per_job',
                  parseInt(e.target.value) || 0,
                )
              }
              disabled={disabled || readOnly}
              readOnly={readOnly}
              min="1"
            />
          </div>
        </div>
      ))}

      {error && (
        <Typography variant="caption" className="text-red-600">
          {error}
        </Typography>
      )}

      {!readOnly && (
        <Typography variant="caption" color="text-secondary">
          파트너로 제공할 서비스와 건당 받을 코인을 설정해주세요. 여러 서비스를
          추가할 수 있습니다.
        </Typography>
      )}
    </div>
  )
}
