import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { Camera } from '@capacitor/camera'
import { PushNotifications } from '@capacitor/push-notifications'
import { FirebaseMessaging } from '@capacitor-firebase/messaging'
import { usePushNotification } from './usePushNotification'
import { useAuth } from './useAuth'
import { saveNativeTokenToServer, flushPendingNativeToken } from '@/lib/nativePush'
import { useAuthStore } from '@/store/useAuthStore'

const PERMISSION_STORAGE_KEY = 'initial-permissions-requested-v2'
let nativePushListenersRegistered = false

// 전역 변수: 앱 콜드 스타트 시 pending call 정보 저장
interface PendingCallData {
  type: 'voice' | 'video'
  roomId: string
  callerId: string
  callerName: string
  timestamp: number
}
export let pendingCallFromPush: PendingCallData | null = null

export function clearPendingCall() {
  pendingCallFromPush = null
}

export function getPendingCall(): PendingCallData | null {
  // 30초 이상 지난 pending call은 무효
  if (pendingCallFromPush && Date.now() - pendingCallFromPush.timestamp > 30000) {
    pendingCallFromPush = null
  }
  return pendingCallFromPush
}

/**
 * 앱 뱃지와 알림 초기화 함수
 * 채팅 화면 진입 시 또는 알림 확인 시 호출
 */
export async function clearAppBadge() {
  if (!Capacitor.isNativePlatform()) return

  try {
    // 전달된 모든 알림 제거
    await PushNotifications.removeAllDeliveredNotifications()
    console.log('✅ 알림 및 뱃지 초기화 완료')
  } catch (error) {
    console.warn('뱃지 초기화 실패:', error)
  }
}

type PermissionOptions = {
  force?: boolean
  onWebNotificationRequest?: () => Promise<void>
}

async function ensureCameraPermission() {
  try {
    const cameraPermission = await Camera.checkPermissions()
    if (cameraPermission.camera === 'prompt' || cameraPermission.camera === 'denied') {
      await Camera.requestPermissions()
      console.log('✅ 카메라 권한 요청 완료')
    }
  } catch (error) {
    console.warn('카메라 권한 요청 실패:', error)
  }
}

function registerNativePushListeners() {
  if (nativePushListenersRegistered) return
  nativePushListenersRegistered = true

  // iOS에서는 Firebase Messaging을 사용해서 FCM 토큰을 가져옴
  const platform = Capacitor.getPlatform()

  if (platform === 'ios') {
    // iOS: Firebase Messaging으로 FCM 토큰 가져오기
    FirebaseMessaging.addListener('tokenReceived', (event) => {
      console.log('📡 FCM token 등록 완료 (iOS):', event.token.substring(0, 50) + '...')
      const userId = useAuthStore.getState().user?.id
      void saveNativeTokenToServer(event.token, userId)
    })
  } else {
    // Android: 기존 방식 유지 (PushNotifications가 FCM 토큰 반환)
  PushNotifications.addListener('registration', (token) => {
      console.log('📡 FCM token 등록 완료 (Android):', token.value.substring(0, 50) + '...')
    const userId = useAuthStore.getState().user?.id
    void saveNativeTokenToServer(token.value, userId)
  })
  }

  PushNotifications.addListener('registrationError', (error) => {
    console.error('❌ Native push registration error:', error)
  })

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('🔔 Native push received (foreground):', notification)

    const data = notification.data

    // 🔴 LiveKit 통화 알림 (네이티브 FCM data-only 메시지)
    if (data?.type === 'livekit-call') {
      console.log('📞 [LiveKit] 수신 통화 FCM 도착:', data)
      const callEvent = new CustomEvent('native-incoming-call', {
        detail: {
          callerId: data.caller_id,
          callerName: data.caller_name || '알 수 없음',
          roomName: data.room_name,
          livekitUrl: data.livekit_url,
          livekitToken: data.livekit_token,
          callType: data.callType || 'voice',
          autoAccept: false,
        }
      })
      window.dispatchEvent(callEvent)
      return
    }
    
    // 🔴 포그라운드에서 통화 알림 수신 시 바로 팝업 표시
    if (data?.type === 'call' && data.roomId) {
      console.log('📞 포그라운드에서 통화 알림 수신 - 통화 팝업 이벤트 발생')
      const callEvent = new CustomEvent('incoming-call-from-push', {
        detail: {
          roomId: data.roomId,
          callerId: data.callerId,
          callerName: notification.title?.replace('📞 통화 요청', '').trim() || '알 수 없음',
        }
      })

      window.dispatchEvent(callEvent)
    }

    // 🔴 포그라운드에서 영상통화 알림 수신 시 바로 팝업 표시
    if (data?.type === 'video_call' && data.roomId) {
      console.log('📹 포그라운드에서 영상통화 알림 수신 - 영상통화 팝업 이벤트 발생')
      const videoCallEvent = new CustomEvent('incoming-video-call-from-push', {
        detail: {
          roomId: data.roomId,
          callerId: data.callerId,
          callerName: notification.title?.replace('📹 영상통화 요청', '').trim() || '알 수 없음',
        }
      })
      window.dispatchEvent(videoCallEvent)
    }
  })

  // 푸시 알림 클릭 시 처리
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('🔔 Push notification clicked:', action)

    const data = action.notification.data
    console.log('📋 Notification data:', data)

    // url 또는 partnerId가 있으면 해당 페이지로 이동
    if (data) {
      // 🔴 LiveKit 통화 알림 클릭 시 처리
      if (data.type === 'livekit-call') {
        console.log('📞 [LiveKit] 통화 알림 클릭 - 통화 수락')
        const callEvent = new CustomEvent('native-incoming-call', {
          detail: {
            callerId: data.caller_id,
            callerName: data.caller_name || '알 수 없음',
            roomName: data.room_name,
            livekitUrl: data.livekit_url,
            livekitToken: data.livekit_token,
            callType: data.callType || 'voice',
            autoAccept: true, // 클릭 시 자동 수락
          }
        })
        window.dispatchEvent(callEvent)
        return
      }
      
      // 🔴 통화 알림인 경우 특별 처리
      if (data.type === 'call' && data.roomId) {
        console.log('📞 통화 알림 클릭 - 통화 팝업 이벤트 발생 예약')
        const callData = {
          roomId: data.roomId,
          callerId: data.callerId,
          callerName: action.notification.title?.replace('📞 통화 요청', '').trim() || '알 수 없음',
        }

        // 전역 변수에 pending call 저장 (Provider 마운트 전 클릭 대비)
        pendingCallFromPush = {
          type: 'voice',
          ...callData,
          timestamp: Date.now(),
        }

        // 이벤트 발생 (여러 번 시도)
        const dispatchCallEvent = () => {
          console.log('📞 통화 알림 이벤트 디스패치 시도')
          window.dispatchEvent(new CustomEvent('incoming-call-from-push', { detail: callData }))
        }

        // 즉시 + 1초 후 + 3초 후 + 5초 후 시도
        dispatchCallEvent()
        setTimeout(dispatchCallEvent, 1000)
        setTimeout(dispatchCallEvent, 3000)
        setTimeout(dispatchCallEvent, 5000)
        return
      }

      // 🔴 영상통화 알림인 경우 특별 처리
      if (data.type === 'video_call' && data.roomId) {
        console.log('📹 영상통화 알림 클릭 - 영상통화 팝업 이벤트 발생 예약')
        const callData = {
          roomId: data.roomId,
          callerId: data.callerId,
          callerName: action.notification.title?.replace('📹 영상통화 요청', '').trim() || '알 수 없음',
        }

        // 전역 변수에 pending call 저장 (Provider 마운트 전 클릭 대비)
        pendingCallFromPush = {
          type: 'video',
          ...callData,
          timestamp: Date.now(),
        }

        // 이벤트 발생 (여러 번 시도)
        const dispatchVideoCallEvent = () => {
          console.log('📹 영상통화 알림 이벤트 디스패치 시도')
          window.dispatchEvent(new CustomEvent('incoming-video-call-from-push', { detail: callData }))
        }

        // 즉시 + 1초 후 + 3초 후 + 5초 후 시도
        dispatchVideoCallEvent()
        setTimeout(dispatchVideoCallEvent, 1000)
        setTimeout(dispatchVideoCallEvent, 3000)
        setTimeout(dispatchVideoCallEvent, 5000)
        return
      }

      let targetUrl: string | null = null

      // 1. url 필드가 있으면 사용 (단, /call/ URL은 무시)
      if (data.url && typeof data.url === 'string' && !data.url.includes('/call/')) {
        targetUrl = data.url
      }

      // 2. partnerId가 있으면 채팅 페이지로 이동
      if (!targetUrl && data.partnerId) {
        targetUrl = `/chat?partnerId=${data.partnerId}`
      }

      // 3. partner_id가 있으면 채팅 페이지로 이동
      if (!targetUrl && data.partner_id) {
        targetUrl = `/chat?partnerId=${data.partner_id}`
      }

      // 4. type이 chat이고 senderId가 있으면 채팅 페이지로 이동
      if (!targetUrl && data.type === 'chat' && data.senderId) {
        targetUrl = `/chat?partnerId=${data.senderId}`
      }

      if (targetUrl) {
        console.log('🚀 Navigating to:', targetUrl)
        // 약간의 지연 후 이동 (앱이 완전히 로드된 후)
        setTimeout(() => {
          window.location.href = targetUrl!
        }, 500)
      }
    }
  })
}

async function ensureNativePushPermission() {
  registerNativePushListeners()

  const platform = Capacitor.getPlatform()

  if (platform === 'ios') {
    // iOS: Firebase Messaging 사용
    const permStatus = await FirebaseMessaging.checkPermissions()
    if (permStatus.receive !== 'granted') {
      const result = await FirebaseMessaging.requestPermissions()
      if (result.receive !== 'granted') {
        console.warn('❌ 푸시 알림 권한이 거부되었습니다.')
        return
      }
    }

    // FCM 토큰 가져오기
    try {
      const { token } = await FirebaseMessaging.getToken()
      console.log('📡 FCM token 획득 (iOS):', token.substring(0, 50) + '...')
      const userId = useAuthStore.getState().user?.id
      void saveNativeTokenToServer(token, userId)
    } catch (error) {
      console.error('❌ FCM 토큰 획득 실패:', error)
    }
  } else {
    // Android: 기존 방식 유지
  const status = await PushNotifications.checkPermissions()
  if (status.receive !== 'granted') {
    const result = await PushNotifications.requestPermissions()
    if (result.receive !== 'granted') {
      console.warn('❌ 푸시 알림 권한이 거부되었습니다.')
      return
    }
  }
  await PushNotifications.register()
  }
}

/**
 * 권한 요청 함수 (외부에서도 호출 가능)
 */
export async function requestInitialPermissions(options: PermissionOptions = {}) {
  const { force = false, onWebNotificationRequest } = options

  const isNative = Capacitor.isNativePlatform()
  let hasRequestedBefore = false
  if (typeof window !== 'undefined') {
    hasRequestedBefore = localStorage.getItem(PERMISSION_STORAGE_KEY) === 'true'
  }

  if (!isNative && hasRequestedBefore && !force) {
    return
  }

  try {
    if (isNative) {
      await ensureCameraPermission()
      await ensureNativePushPermission()
    } else if (onWebNotificationRequest) {
      await onWebNotificationRequest()
    } else if (typeof window !== 'undefined' && 'Notification' in window) {
      const currentPermission = Notification.permission
      if (currentPermission === 'default') {
        await Notification.requestPermission()
      }
    }

    if (typeof window !== 'undefined' && (isNative ? true : !hasRequestedBefore || force)) {
      localStorage.setItem(PERMISSION_STORAGE_KEY, 'true')
    }
  } catch (error) {
    console.error('초기 권한 요청 실패:', error)
  }
}

/**
 * 앱 실행시 스플래시 이후 최초 1번 카메라/알림 권한 획득
 */
export function useInitialPermissions() {
  const { user, isAuthenticated } = useAuth()
  const { requestPermission: requestNotificationPermission, registerPushSubscription } = usePushNotification()
  const hasRequestedRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated || !user || hasRequestedRef.current) {
      return
    }

    const timer = setTimeout(() => {
      requestInitialPermissions({
        onWebNotificationRequest: async () => {
          if (typeof window === 'undefined') return
          const granted = await requestNotificationPermission()
          if (granted && 'serviceWorker' in navigator) {
            await registerPushSubscription()
          }
        },
      }).finally(() => {
        hasRequestedRef.current = true
      })
    }, 500)

    return () => clearTimeout(timer)
  }, [isAuthenticated, user, requestNotificationPermission, registerPushSubscription])

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      void flushPendingNativeToken(user.id)
    }
  }, [isAuthenticated, user?.id])
}