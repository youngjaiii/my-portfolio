import { useDevice } from '../../hooks/useDevice'

export const DeviceInfo = () => {
  const { deviceType, isMobile, isDesktop } = useDevice()

  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <h3 className="text-lg font-semibold mb-2">Device Information</h3>
      <div className="space-y-1">
        <p>
          Device Type: <span className="font-medium">{deviceType}</span>
        </p>
        <p>
          Is Mobile:{' '}
          <span className="font-medium">{isMobile ? 'Yes' : 'No'}</span>
        </p>
        <p>
          Is Desktop:{' '}
          <span className="font-medium">{isDesktop ? 'Yes' : 'No'}</span>
        </p>
      </div>

      {isMobile && (
        <div className="mt-3 p-3 bg-blue-100 rounded">
          <p className="text-blue-800">
            📱 모바일 환경에 최적화된 UI를 표시합니다.
          </p>
        </div>
      )}

      {isDesktop && (
        <div className="mt-3 p-3 bg-green-100 rounded">
          <p className="text-green-800">
            🖥️ 데스크톱 환경에 최적화된 UI를 표시합니다.
          </p>
        </div>
      )}
    </div>
  )
}
