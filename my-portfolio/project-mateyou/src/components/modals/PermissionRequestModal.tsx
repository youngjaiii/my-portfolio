import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Typography } from '@/components/ui/Typography'
import { Button } from '@/components/ui/Button'
import { Flex } from '@/components/ui/Flex'
import { useNotification } from '@/hooks/useNotification'
import { usePushNotification } from '@/hooks/usePushNotification'
import { safeGetUserMedia } from '@/lib/utils'

interface PermissionRequestModalProps {
  isOpen: boolean
  onClose: () => void
}

type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported'

export function PermissionRequestModal({ isOpen, onClose }: PermissionRequestModalProps) {
  const { permission: notificationPermission, requestPermission: requestNotificationPermission, isSupported: isNotificationSupported } = useNotification()
  const { registerPushSubscription } = usePushNotification()
  
  const [microphonePermission, setMicrophonePermission] = useState<PermissionState>('prompt')
  const [isMicrophoneSupported, setIsMicrophoneSupported] = useState(false)
  const [isLoadingNotification, setIsLoadingNotification] = useState(false)
  const [isLoadingMicrophone, setIsLoadingMicrophone] = useState(false)

  // 마이크 권한 지원 여부 및 상태 체크
  useEffect(() => {
    // navigator.permissions 지원 여부 확인
    if (typeof navigator !== 'undefined' && navigator.permissions) {
      setIsMicrophoneSupported(true)
      
      // 마이크 권한 상태 체크
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((result) => {
          setMicrophonePermission(result.state as PermissionState)
          
          // 권한 상태 변경 감지
          result.onchange = () => {
            setMicrophonePermission(result.state as PermissionState)
          }
        })
        .catch((error) => {
          console.warn('마이크 권한 상태 확인 실패:', error)
          // 에러 발생 시 지원하지 않는 것으로 간주하지 않고, prompt 상태로 유지
          setMicrophonePermission('prompt')
        })
    } else {
      // navigator.permissions를 지원하지 않는 경우
      setIsMicrophoneSupported(false)
      setMicrophonePermission('unsupported')
    }

    // getUserMedia 지원 여부 확인
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      // 이미 지원 여부가 확인되었으므로 추가 처리 불필요
    } else {
      setIsMicrophoneSupported(false)
      setMicrophonePermission('unsupported')
    }
  }, [])

  // 알람 권한 토글
  const handleNotificationToggle = async (enabled: boolean) => {
    if (!isNotificationSupported) {
      alert('이 브라우저는 알람 기능을 지원하지 않습니다.')
      return
    }

    if (enabled) {
      setIsLoadingNotification(true)
      try {
        const granted = await requestNotificationPermission()
        if (granted) {
          // 권한 승인 후 푸시 구독 등록
          await registerPushSubscription()
        }
      } catch (error) {
        console.error('알람 권한 요청 실패:', error)
        alert('알람 권한 요청에 실패했습니다.')
      } finally {
        setIsLoadingNotification(false)
      }
    } else {
      // 웹에서는 권한을 직접 거부할 수 없지만, 사용자에게 안내
      alert('알람 권한을 거부하려면 브라우저 설정에서 변경해주세요.')
    }
  }

  // 마이크 권한 토글
  const handleMicrophoneToggle = async (enabled: boolean) => {
    if (!isMicrophoneSupported) {
      alert('이 브라우저는 마이크 기능을 지원하지 않습니다.')
      return
    }

    if (enabled) {
      setIsLoadingMicrophone(true)
      try {
        // getUserMedia를 호출하여 권한 요청 (Android WebView 호환)
        const stream = await safeGetUserMedia({ audio: true })
        // 테스트 후 즉시 종료
        stream.getTracks().forEach(track => track.stop())
        
        // 권한 상태 업데이트
        if (navigator.permissions) {
          navigator.permissions
            .query({ name: 'microphone' as PermissionName })
            .then((result) => {
              setMicrophonePermission(result.state as PermissionState)
            })
            .catch(() => {
              // 권한 상태 확인 실패해도 성공으로 간주
              setMicrophonePermission('granted')
            })
        } else {
          setMicrophonePermission('granted')
        }
      } catch (error: any) {
        console.error('마이크 권한 요청 실패:', error)
        
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          setMicrophonePermission('denied')
          alert('마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크 권한을 허용해주세요.')
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          alert('마이크를 찾을 수 없습니다.')
        } else {
          alert('마이크 권한 요청에 실패했습니다.')
        }
      } finally {
        setIsLoadingMicrophone(false)
      }
    } else {
      alert('마이크 권한을 거부하려면 브라우저 설정에서 변경해주세요.')
    }
  }

  const notificationEnabled = notificationPermission === 'granted'
  const microphoneEnabled = microphonePermission === 'granted'
  const notificationDisabled = !isNotificationSupported || notificationPermission === 'denied'
  const microphoneDisabled = !isMicrophoneSupported || microphonePermission === 'denied'

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6 max-w-md mx-auto">
        <Typography variant="h3" className="mb-2">
          권한 설정
        </Typography>
        <Typography variant="body2" color="text-secondary" className="mb-6">
          원활한 서비스 이용을 위해 다음 권한이 필요합니다.
        </Typography>

        {/* 알람 권한 */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <Flex align="center" justify="between" className="mb-2">
            <div className="flex-1">
              <Flex align="center" gap={2} className="mb-1">
                <span className="text-xl">🔔</span>
                <Typography variant="body1" className="font-medium">
                  알람 권한
                </Typography>
              </Flex>
              <Typography variant="caption" color="text-secondary" className="ml-7">
                새로운 메시지와 통화 알림을 받습니다
              </Typography>
            </div>
            <label 
              className={`
                relative inline-flex items-center cursor-pointer
                ${notificationDisabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <input
                type="checkbox"
                checked={notificationEnabled}
                onChange={(e) => handleNotificationToggle(e.target.checked)}
                disabled={notificationDisabled || isLoadingNotification}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
            </label>
          </Flex>
          {!isNotificationSupported && (
            <Typography variant="caption" color="text-secondary" className="ml-7 text-xs">
              이 브라우저는 알람 기능을 지원하지 않습니다.
            </Typography>
          )}
          {notificationPermission === 'denied' && (
            <Typography variant="caption" color="error" className="ml-7 text-xs">
              브라우저 설정에서 알람 권한을 허용해주세요.
            </Typography>
          )}
          {isLoadingNotification && (
            <Typography variant="caption" color="text-secondary" className="ml-7 text-xs">
              권한 요청 중...
            </Typography>
          )}
        </div>

        {/* 마이크 권한 */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <Flex align="center" justify="between" className="mb-2">
            <div className="flex-1">
              <Flex align="center" gap={2} className="mb-1">
                <span className="text-xl">🎤</span>
                <Typography variant="body1" className="font-medium">
                  마이크 권한
                </Typography>
              </Flex>
              <Typography variant="caption" color="text-secondary" className="ml-7">
                음성 통화를 위해 필요합니다
              </Typography>
            </div>
            <label 
              className={`
                relative inline-flex items-center cursor-pointer
                ${microphoneDisabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <input
                type="checkbox"
                checked={microphoneEnabled}
                onChange={(e) => handleMicrophoneToggle(e.target.checked)}
                disabled={microphoneDisabled || isLoadingMicrophone}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
            </label>
          </Flex>
          {!isMicrophoneSupported && (
            <Typography variant="caption" color="text-secondary" className="ml-7 text-xs">
              이 브라우저는 마이크 기능을 지원하지 않습니다.
            </Typography>
          )}
          {microphonePermission === 'denied' && (
            <Typography variant="caption" color="error" className="ml-7 text-xs">
              브라우저 설정에서 마이크 권한을 허용해주세요.
            </Typography>
          )}
          {isLoadingMicrophone && (
            <Typography variant="caption" color="text-secondary" className="ml-7 text-xs">
              권한 요청 중...
            </Typography>
          )}
        </div>

        <Button onClick={onClose} className="w-full" variant="primary">
          확인
        </Button>
      </div>
    </Modal>
  )
}

