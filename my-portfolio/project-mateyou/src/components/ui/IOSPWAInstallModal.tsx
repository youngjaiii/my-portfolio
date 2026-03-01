import { useState } from 'react'
import { Typography, Button } from '@/components'

interface IOSPWAInstallModalProps {
  isOpen: boolean
  onClose: () => void
}

export function IOSPWAInstallModal({ isOpen, onClose }: IOSPWAInstallModalProps) {
  const [currentStep, setCurrentStep] = useState(1)

  if (!isOpen) return null

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1)
    } else {
      onClose()
    }
  }

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleClose = () => {
    setCurrentStep(1)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-blue-500 text-white p-4 relative">
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 text-white/80 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <Typography variant="h3" className="text-white font-bold">
            iOS 알림 설정 안내
          </Typography>
          <Typography variant="body2" className="text-white/90 mt-1">
            단계 {currentStep} / 3
          </Typography>
        </div>

        {/* Content */}
        <div className="p-6">
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <div className="bg-gray-100 rounded-lg p-4">
                  <svg className="w-16 h-16 text-blue-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </div>
              </div>
              <Typography variant="h4" className="text-center font-semibold">
                하단의 공유 버튼을 탭하세요
              </Typography>
              <Typography variant="body2" className="text-gray-600 text-center">
                Safari 브라우저 하단 중앙에 있는{' '}
                <span className="inline-flex items-center">
                  <svg className="w-5 h-5 text-blue-500 mx-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </span>
                공유 아이콘을 탭합니다.
              </Typography>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <Typography variant="body2" className="text-yellow-800 text-sm">
                  iOS에서는 PWA(앱)로 설치해야만 푸시 알림을 받을 수 있습니다.
                </Typography>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <div className="bg-gray-100 rounded-lg p-4">
                  <svg className="w-16 h-16 text-blue-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
              </div>
              <Typography variant="h4" className="text-center font-semibold">
                "홈 화면에 추가"를 선택하세요
              </Typography>
              <Typography variant="body2" className="text-gray-600 text-center">
                공유 메뉴에서 스크롤하여{' '}
                <span className="font-semibold text-blue-500">"홈 화면에 추가"</span>
                {' '}옵션을 찾아 탭합니다.
              </Typography>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <Typography variant="body2" className="text-blue-800 text-sm">
                  이 옵션이 보이지 않으면 아래로 스크롤해보세요.
                </Typography>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <div className="bg-green-100 rounded-lg p-4">
                  <svg className="w-16 h-16 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <Typography variant="h4" className="text-center font-semibold">
                "추가" 버튼을 탭하세요
              </Typography>
              <Typography variant="body2" className="text-gray-600 text-center">
                우측 상단의{' '}
                <span className="font-semibold text-blue-500">"추가"</span>
                {' '}버튼을 탭하면 홈 화면에 앱 아이콘이 생성됩니다.
              </Typography>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <Typography variant="body2" className="text-green-800 text-sm">
                  설치 후 홈 화면에서 앱을 실행하면 푸시 알림을 받을 수 있습니다!
                </Typography>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 p-4 flex justify-between">
          <Button
            onClick={handlePrev}
            disabled={currentStep === 1}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium
              ${currentStep === 1
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}
            `}
          >
            이전
          </Button>
          <Button
            onClick={handleNext}
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium"
          >
            {currentStep === 3 ? '완료' : '다음'}
          </Button>
        </div>
      </div>
    </div>
  )
}
