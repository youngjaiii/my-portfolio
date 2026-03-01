import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Capacitor } from '@capacitor/core'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Android WebView에서도 작동하는 UUID 생성 함수
 * crypto.randomUUID()가 없으면 폴백 사용
 */
export function generateUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // ignore and fallback
  }
  // 폴백: UUID v4 형식으로 생성
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Android 네이티브 마이크 권한 확인
 * 권한은 MainActivity.java에서 앱 시작 시 요청됩니다.
 */
export async function checkMicrophonePermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    console.log('🎤 [Mic Permission] Web environment')
    return true
  }

  const platform = Capacitor.getPlatform()
  console.log('🎤 [Mic Permission] Platform:', platform)

  // navigator.permissions API로 권한 상태 확인
  if ('permissions' in navigator) {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      console.log('🎤 [Mic Permission] Status:', result.state)
      return result.state === 'granted' || result.state === 'prompt'
    } catch {
      console.log('🎤 [Mic Permission] Query not supported')
    }
  }

  return true // 권한 확인이 안 되면 일단 시도
}

/**
 * Android WebView에서도 작동하는 getUserMedia 래퍼
 * navigator.mediaDevices가 없을 경우 명확한 에러 메시지 제공
 */
export async function safeGetUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  // navigator.mediaDevices 존재 여부 확인
  if (typeof navigator === 'undefined') {
    throw new Error('Navigator API를 사용할 수 없습니다.')
  }
  
  if (!navigator.mediaDevices) {
    console.error('❌ [safeGetUserMedia] navigator.mediaDevices is undefined')
    console.error('  - navigator:', typeof navigator)
    console.error('  - mediaDevices:', navigator.mediaDevices)
    console.error('  - location.protocol:', window.location?.protocol)
    
    // Android WebView에서 secure context 문제일 수 있음
    if (window.location?.protocol !== 'https:' && window.location?.protocol !== 'capacitor:') {
      throw new Error('마이크 접근을 위해 보안 연결(HTTPS)이 필요합니다. 현재: ' + window.location?.protocol)
    }
    
    throw new Error('이 브라우저/환경에서는 마이크를 사용할 수 없습니다. WebView 권한을 확인해주세요.')
  }
  
  if (!navigator.mediaDevices.getUserMedia) {
    throw new Error('getUserMedia API를 지원하지 않는 브라우저입니다.')
  }
  
  // Android에서는 먼저 권한 상태 로깅
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    console.log('🎤 [safeGetUserMedia] Android detected, checking permissions...')
  }
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    console.log('✅ [safeGetUserMedia] Stream acquired successfully')
    return stream
  } catch (error) {
    console.error('❌ [safeGetUserMedia] getUserMedia failed:', error)
    
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError') {
        throw new Error('마이크 사용 권한이 거부되었습니다. 설정에서 권한을 허용해주세요.')
      }
      if (error.name === 'NotFoundError') {
        throw new Error('마이크를 찾을 수 없습니다. 기기에 마이크가 연결되어 있는지 확인해주세요.')
      }
      if (error.name === 'NotReadableError') {
        throw new Error('마이크에 접근할 수 없습니다. 다른 앱에서 사용 중일 수 있습니다.')
      }
    }
    
    throw error
  }
}