import { Capacitor } from '@capacitor/core'
import { Device } from '@capacitor/device'
import { edgeApi } from '@/lib/edgeApi'
import { useAuthStore } from '@/store/useAuthStore'
import LiveKit from '@/plugins/LiveKit'

let cachedDeviceId: string | null = null
let pendingToken: string | null = null

function isNative() {
  return Capacitor.isNativePlatform()
}

async function resolveDeviceId(): Promise<string | null> {
  if (cachedDeviceId) {
    return cachedDeviceId
  }

  try {
    const info = await Device.getId()
    cachedDeviceId = info.identifier
    return cachedDeviceId
  } catch (error) {
    console.warn('Unable to resolve device identifier for native push:', error)
    return null
  }
}

export async function saveNativeTokenToServer(token: string, explicitUserId?: string | null) {
  if (!isNative() || !token) {
    return
  }

  pendingToken = token

  const userId = explicitUserId ?? useAuthStore.getState().user?.id
  if (!userId) {
    console.warn('⚠️ 네이티브 푸시 토큰 저장 불가: user_id 없음')
    return
  }

  const deviceId = await resolveDeviceId()
  if (!deviceId) {
    console.warn('⚠️ 네이티브 푸시 토큰 저장 불가: device_id 확인 실패')
    return
  }

  try {
    console.log('🔄 네이티브 푸시 토큰 서버 저장 시도', { userId, deviceId })
    
    const platform = Capacitor.getPlatform()
    const tokenData: any = {
      user_id: userId,
      device_id: deviceId,
      platform,
      token,
    }
    
    // iOS일 때 voip_token과 apns_env도 함께 전달
    if (platform === 'ios') {
      try {
        const voipResult = await LiveKit.getVoIPToken()
        if (voipResult.token) {
          tokenData.voip_token = voipResult.token
          tokenData.apns_env = voipResult.apnsEnv || 'production'
          console.log('📱 VoIP token included in push-native save, apnsEnv:', tokenData.apns_env)
        }
      } catch (voipError) {
        console.warn('⚠️ Failed to get VoIP token for push-native save:', voipError)
      }
    }
    
    await edgeApi.nativePush.saveToken(tokenData)
    console.log('✅ 네이티브 푸시 토큰 서버 저장 성공')
    pendingToken = null
  } catch (error) {
    console.error('Failed to save native push token:', error)
  }
}

export async function flushPendingNativeToken(userId?: string) {
  if (!pendingToken) {
    return
  }
  await saveNativeTokenToServer(pendingToken, userId)
}

export async function deactivateNativePushToken() {
  if (!isNative()) {
    return
  }

  const deviceId = await resolveDeviceId()
  if (!deviceId) {
    return
  }

  try {
    await edgeApi.nativePush.deactivateToken({ device_id: deviceId })
  } catch (error) {
    console.error('Failed to deactivate native push token:', error)
  }
}

