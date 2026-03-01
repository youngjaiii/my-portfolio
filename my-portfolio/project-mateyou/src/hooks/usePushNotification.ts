import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from './useAuth'
import { mateYouApi } from '@/lib/apiClient'

export const usePushNotification = () => {
  const { user } = useAuth()
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [isSupported, setIsSupported] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default')
  const isRegisteringRef = useRef(false) // 중복 호출 방지
  const hasRegisteredRef = useRef(false) // 이미 등록했는지 확인
  const savePushSubscriptionRef = useRef<((subscription: PushSubscription) => Promise<void>) | null>(null)
  const requestPermissionRef = useRef<(() => Promise<boolean>) | null>(null)

  // 🧩 Helper: base64 → Uint8Array 변환
  const urlBase64ToUint8Array = (base64String: string): BufferSource => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
  }

  // 📱 브라우저 지원 확인
  const checkSupport = () => {
    const supported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window

    setIsSupported(supported)

    if (supported) {
      setPermissionStatus(Notification.permission)
    }

    return supported
  }

  // 🔔 알림 권한 요청
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      console.warn('🚫 브라우저가 푸시 알림을 지원하지 않습니다.')
      return false
    }

    const permission = await Notification.requestPermission()
    setPermissionStatus(permission)

    if (permission === 'granted') {
      return true
    } else {
      console.warn('❌ 알림 권한이 거부되었습니다.')
      return false
    }
  }, [isSupported])

  // 💾 서버에 구독 정보 저장
  const savePushSubscription = useCallback(async (subscription: PushSubscription) => {
    if (!user?.id) {
      console.warn('⚠️ 사용자 ID가 없어 구독 정보를 저장할 수 없습니다.')
      return
    }

    try {
      // 브라우저 PushSubscription 객체에서 키 추출
      let p256dh: string
      let auth: string

      // toJSON() 메서드가 있으면 먼저 시도 (가장 간단)
      if ('toJSON' in subscription && typeof subscription.toJSON === 'function') {
        const subJson = subscription.toJSON() as any
        if (subJson.keys) {
          p256dh = subJson.keys.p256dh
          auth = subJson.keys.auth
        } else {
          throw new Error('Invalid subscription format: missing keys')
        }
      } else if ('keys' in subscription && subscription.keys) {
        // 이미 변환된 객체인 경우
        const keys = (subscription as any).keys
        p256dh = keys.p256dh
        auth = keys.auth
      } else if ('getKey' in subscription && typeof subscription.getKey === 'function') {
        // getKey() 메서드 사용 (toJSON이 없는 경우)
        const p256dhKey = subscription.getKey('p256dh')
        const authKey = subscription.getKey('auth')
        
        if (!p256dhKey || !authKey) {
          throw new Error('Failed to extract subscription keys')
        }

        // ArrayBuffer를 base64로 변환 (URL-safe)
        const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
          const bytes = new Uint8Array(buffer)
          let binary = ''
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i])
          }
          return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
        }

        p256dh = arrayBufferToBase64(p256dhKey)
        auth = arrayBufferToBase64(authKey)
      } else {
        throw new Error('Unsupported subscription format')
      }

      // user.role에 따라 member_id 또는 partner_id 설정
      const isPartner = user.role === 'partner'
      
      // partner인 경우 partner_id 조회 필요
      // 406 에러 방지를 위해 Edge Function을 통해 조회하거나 null로 처리
      let partnerId = null
      if (isPartner) {
        try {
          // Express API를 통해 파트너 정보 조회
          const partnerStatusResponse = await mateYouApi.auth.getPartnerStatus()

          if (partnerStatusResponse?.data?.success && (partnerStatusResponse?.data?.data as any)?.partnerId) {
            partnerId = (partnerStatusResponse.data.data as any).partnerId
          } else {
            console.log('ℹ️ 파트너 ID 없음 (Express API):', partnerStatusResponse?.data?.error?.message)
          }
        } catch (err: any) {
          console.error('❌ 파트너 ID 조회 실패 (Express API):', {
            message: err?.message,
            stack: err?.stack,
            name: err?.name,
            error: err
          })
          // Express API 실패 시 null로 처리 (구독 저장은 계속 진행)
        }
      }

      // 새로운 API 사용: /api/push/subscribe
      try {
        const response = await mateYouApi.push.subscribe({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: p256dh,
            auth: auth,
          },
        })
        
        if (!response?.data?.success) {
          throw new Error(response?.data?.error?.message || '구독 정보 저장 실패')
        }
        
        console.log('✅ 푸시 구독 저장 완료 (새 API)')
      } catch (newApiError: any) {
        // 새로운 API 실패 시 에러 throw (fallback 제거)
        console.error('❌ 푸시 구독 저장 실패:', newApiError)
        throw newApiError
      }
      
    } catch (error) {
      console.error('❌ 구독 정보 저장 실패:', error)
      throw error // 에러를 다시 throw하여 호출자가 처리할 수 있도록
    }
  }, [user?.id, user?.role])

  // ref에 함수 참조 저장
  savePushSubscriptionRef.current = savePushSubscription
  requestPermissionRef.current = requestPermission

  /**
   * 🐾 1️⃣ 로그인 시점: 푸시 받을 준비 단계
   * 
   * 설명된 흐름:
   * 1. 서비스워커 등록
   * 2. 알림 권한 요청 (최초 1회)
   * 3. Push Subscription 생성 (기존 구독 재사용 또는 새로 생성)
   * 4. 구독 정보 Supabase에 저장 (web_push_subscriptions 테이블)
   * 
   * 결과: 이 기기 + 브라우저 + 로그인한 유저 조합이 web_push_subscriptions에 등록됨
   */
  const ensurePushSubscription = useCallback(async (): Promise<PushSubscription | null> => {
    // 중복 호출 방지
    if (isRegisteringRef.current) {
      return null
    }

    if (hasRegisteredRef.current && subscription) {
      return subscription
    }

    if (!isSupported || !user?.id) {
      return null
    }

    isRegisteringRef.current = true

    try {
      // 1-1. 서비스워커 등록
      // /public/sw.js 파일이 서비스워커로 등록됨
      // 이때부터 브라우저는 이 사이트에 대해 백그라운드 작업 담당자를 두게 됨
      const registration = await navigator.serviceWorker.register('/sw.js')

      // 1-2. 알림 권한 요청 (최초 1회)
      // 유저가 거부하면 여기서 끝
      if (permissionStatus !== 'granted') {
        const requestPermissionFn = requestPermissionRef.current
        if (!requestPermissionFn) {
          isRegisteringRef.current = false
          return null
        }
        const hasPermission = await requestPermissionFn()
        if (!hasPermission) {
          console.warn('❌ 알림 권한이 거부되었습니다.')
          isRegisteringRef.current = false
          return null
        }
      }

      // 1-3. Push Subscription 생성
      // 이미 구독한 적 있으면 재사용, 없으면 새로 구독 생성
      const existingSubscription = await registration.pushManager.getSubscription()
      if (existingSubscription) {
        setSubscription(existingSubscription)
        hasRegisteredRef.current = true

        // 서버에 구독 정보 업데이트
        const saveFn = savePushSubscriptionRef.current
        if (saveFn) {
          try {
            await saveFn(existingSubscription)
          } catch (err) {
            console.error('❌ 구독 정보 저장 실패:', err)
            // 에러를 무시하지 않고 로그만 남김
          }
        } else {
          console.warn('⚠️ savePushSubscription 함수가 아직 초기화되지 않았습니다.')
        }
        
        isRegisteringRef.current = false
        return existingSubscription
      }

      // 1-3-2. 새로운 구독 등록 (기존 구독이 없는 경우)
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        console.error('❌ VITE_VAPID_PUBLIC_KEY가 설정되지 않았습니다.')
        isRegisteringRef.current = false
        return null
      }

      const convertedVapidKey = urlBase64ToUint8Array(vapidKey)

      const newSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      })

      setSubscription(newSubscription)
      hasRegisteredRef.current = true

      // 1-4. 구독 정보 Supabase에 저장
      // subscription.toJSON()으로 endpoint, p256dh, auth 추출하여 DB에 저장
      const saveFn = savePushSubscriptionRef.current
      if (saveFn) {
        try {
          await saveFn(newSubscription)
        } catch (err) {
          console.error('❌ 구독 정보 저장 실패:', err)
          // 에러를 무시하지 않고 로그만 남김
        }
      } else {
        console.warn('⚠️ savePushSubscription 함수가 아직 초기화되지 않았습니다.')
      }

      isRegisteringRef.current = false
      return newSubscription
    } catch (error) {
      console.error('❌ 푸시 구독 등록 실패:', error)
      isRegisteringRef.current = false
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported, user?.id, permissionStatus, subscription])

  // registerPushSubscription을 ensurePushSubscription으로도 export
  const registerPushSubscription = ensurePushSubscription

  // 🗑️ 푸시 구독 해제
  const unsubscribePush = async () => {
    if (!subscription || !user?.id) return

    try {
      await subscription.unsubscribe()
      setSubscription(null)

      // 서버에서도 구독 정보 삭제
      const isPartner = user.role === 'partner'
      let partnerId = null
      if (isPartner) {
        try {
          // Express API를 통해 파트너 정보 조회
          const partnerStatusResponse = await mateYouApi.auth.getPartnerStatus()

          if (partnerStatusResponse?.data?.success && (partnerStatusResponse?.data?.data as any)?.partnerId) {
            partnerId = (partnerStatusResponse.data.data as any).partnerId
          } else {
            console.log('ℹ️ 구독 해제: 파트너 ID 없음 (Express API)')
          }
        } catch (err: any) {
          console.error('❌ 구독 해제: 파트너 ID 조회 실패 (Express API):', {
            message: err?.message,
            stack: err?.stack,
            name: err?.name,
            error: err
          })
          // Express API 실패 시 null로 처리 (구독 삭제는 계속 진행)
        }
      }

      // 새로운 API는 구독 해제를 자동으로 처리하므로 별도 호출 불필요
      // 구독 해제는 브라우저에서 자동으로 처리됨
      console.log('ℹ️ 푸시 구독 해제는 자동으로 처리됩니다.')
    } catch (error) {
      console.error('❌ 푸시 구독 해제 실패:', error)
    }
  }

  // 🔄 초기화 및 자동 등록
  useEffect(() => {
    if (!checkSupport()) return

    // 로그인 상태이고 권한이 있으면 자동으로 구독 등록
    if (user?.id && permissionStatus === 'granted') {
      registerPushSubscription()
    }
  }, [user?.id, permissionStatus])

  /**
   * 푸시 알림 전송 (새로운 API 사용)
   * 일반적인 알림은 queue 사용, 긴급한 알림은 send 사용
   */
  const sendNotification = useCallback(async (
    notification: {
      title: string
      body: string
      type?: 'message' | 'request' | 'payment' | 'system' | 'call' | 'review'
      url?: string
      tag?: string
      icon?: string
      data?: Record<string, any>
      urgent?: boolean // 긴급한 경우 true로 설정하면 send 사용
    },
    targetMemberId?: string | null,
    targetPartnerId?: string | null
  ) => {
    try {
      const notificationData = {
        target_member_id: targetMemberId,
        target_partner_id: targetPartnerId,
        title: notification.title,
        body: notification.body,
        notification_type: notification.type || 'system',
        url: notification.url || '/',
        tag: notification.tag,
        icon: notification.icon,
        data: notification.data,
      }

      // 긴급한 경우 즉시 전송, 그 외에는 큐에 추가
      if (notification.urgent) {
        const response = await mateYouApi.push.send(notificationData)
        return response
      } else {
        const response = await mateYouApi.push.queue(notificationData)
        return response
      }
    } catch (error) {
      console.error('푸시 알림 전송 실패:', error)
      throw error
    }
  }, [])

  return {
    isSupported,
    permissionStatus,
    subscription,
    requestPermission,
    registerPushSubscription,
    ensurePushSubscription, // 설명된 흐름에 맞는 명확한 이름
    unsubscribePush,
    isSubscribed: !!subscription,
    sendNotification, // 새로운 API를 사용하는 알림 전송 함수
  }
}