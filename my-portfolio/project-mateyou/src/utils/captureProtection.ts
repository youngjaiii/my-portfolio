/**
 * 캡처 방지 유틸리티
 * 웹/네이티브앱 모두 지원
 * 
 * 주의: 완벽한 캡처 방지는 기술적으로 불가능합니다.
 * 하지만 일반적인 캡처 시도는 최대한 방지합니다.
 */

import { Capacitor } from '@capacitor/core'

// 캡처 방지 CSS 클래스
export const CAPTURE_PROTECTION_CLASS = 'capture-protected'

// 보호된 콘텐츠 블러 상태
let isContentBlurred = false

/**
 * 캡처 방지 CSS 스타일 주입
 */
export function injectCaptureProtectionStyles() {
  if (typeof document === 'undefined') return
  
  const styleId = 'capture-protection-styles'
  if (document.getElementById(styleId)) return
  
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    /* 캡처 방지 스타일 */
    .${CAPTURE_PROTECTION_CLASS} {
      -webkit-user-select: none !important;
      -moz-user-select: none !important;
      -ms-user-select: none !important;
      user-select: none !important;
      -webkit-touch-callout: none !important;
      -webkit-tap-highlight-color: transparent !important;
    }
    
    .${CAPTURE_PROTECTION_CLASS} img,
    .${CAPTURE_PROTECTION_CLASS} video,
    .${CAPTURE_PROTECTION_CLASS} canvas {
      -webkit-user-drag: none !important;
      -khtml-user-drag: none !important;
      -moz-user-drag: none !important;
      -o-user-drag: none !important;
      user-drag: none !important;
    }
    
    /* 콘텐츠 블러 상태 */
    .${CAPTURE_PROTECTION_CLASS}.content-blurred img,
    .${CAPTURE_PROTECTION_CLASS}.content-blurred video,
    .${CAPTURE_PROTECTION_CLASS}.content-blurred canvas {
      filter: blur(30px) !important;
      transition: filter 0.1s ease !important;
    }
    
    /* 프린트 시 숨김 */
    @media print {
      .${CAPTURE_PROTECTION_CLASS} {
        display: none !important;
        visibility: hidden !important;
      }
      
      body::before {
        content: "콘텐츠 보호를 위해 인쇄가 제한됩니다.";
        display: block;
        text-align: center;
        padding: 50px;
        font-size: 24px;
      }
    }
    
    /* 스크린샷 감지 시 오버레이 */
    .screenshot-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: black;
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 18px;
    }
  `
  document.head.appendChild(style)
}

/**
 * 콘텐츠 블러 처리
 */
export function blurContent() {
  if (isContentBlurred) return
  isContentBlurred = true
  
  const elements = document.querySelectorAll(`.${CAPTURE_PROTECTION_CLASS}`)
  elements.forEach(el => {
    el.classList.add('content-blurred')
  })
}

/**
 * 콘텐츠 블러 해제
 */
export function unblurContent() {
  if (!isContentBlurred) return
  isContentBlurred = false
  
  const elements = document.querySelectorAll(`.${CAPTURE_PROTECTION_CLASS}`)
  elements.forEach(el => {
    el.classList.remove('content-blurred')
  })
}

/**
 * 스크린샷 오버레이 표시
 */
function showScreenshotOverlay() {
  const existing = document.getElementById('screenshot-overlay')
  if (existing) return
  
  const overlay = document.createElement('div')
  overlay.id = 'screenshot-overlay'
  overlay.className = 'screenshot-overlay'
  overlay.textContent = '스크린샷이 감지되었습니다'
  document.body.appendChild(overlay)
  
  setTimeout(() => {
    overlay.remove()
  }, 1000)
}

// localhost 여부 확인
const isLocalhost = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || 
   window.location.hostname === '127.0.0.1' ||
   window.location.hostname.startsWith('192.168.'))

/**
 * 키보드 단축키 캡처 방지
 */
export function preventKeyboardCapture(event: KeyboardEvent) {
  // Windows 키가 눌린 경우 모두 블러 처리 (게임바, 캡처 도구 등)
  if (event.metaKey || event.key === 'Meta' || event.key === 'OS') {
    blurContent()
    // 블러 해제는 포커스 복귀 시 처리
  }
  
  // PrintScreen 키 방지
  if (event.key === 'PrintScreen' || event.code === 'PrintScreen') {
    event.preventDefault()
    event.stopPropagation()
    blurContent()
    showScreenshotOverlay()
    setTimeout(unblurContent, 2000)
    return false
  }
  
  // Windows 게임바 (Win + G)
  if (event.metaKey && event.key.toLowerCase() === 'g') {
    event.preventDefault()
    event.stopPropagation()
    blurContent()
    showScreenshotOverlay()
    return false
  }
  
  // Windows 게임바 스크린샷 (Win + Alt + PrintScreen)
  if (event.metaKey && event.altKey) {
    event.preventDefault()
    event.stopPropagation()
    blurContent()
    showScreenshotOverlay()
    return false
  }
  
  // Windows 게임바 녹화 (Win + Alt + R)
  if (event.metaKey && event.altKey && event.key.toLowerCase() === 'r') {
    event.preventDefault()
    event.stopPropagation()
    blurContent()
    showScreenshotOverlay()
    return false
  }
  
  // Windows 캡처 도구 (Win + Shift + S)
  if (event.metaKey && event.shiftKey && event.key.toLowerCase() === 's') {
    event.preventDefault()
    event.stopPropagation()
    blurContent()
    showScreenshotOverlay()
    setTimeout(unblurContent, 2000)
    return false
  }
  
  // Mac 스크린샷 (Cmd + Shift + 3, 4, 5)
  if (event.metaKey && event.shiftKey && ['3', '4', '5'].includes(event.key)) {
    event.preventDefault()
    event.stopPropagation()
    blurContent()
    showScreenshotOverlay()
    setTimeout(unblurContent, 2000)
    return false
  }
  
  // Ctrl+P (인쇄) 방지
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
    event.preventDefault()
    event.stopPropagation()
    return false
  }
  
  // Ctrl+S (저장) 방지
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    event.stopPropagation()
    return false
  }
  
  // 개발자 도구 관련 - localhost에서는 허용
  if (!isLocalhost) {
    // F12 (개발자 도구) 방지
    if (event.key === 'F12') {
      event.preventDefault()
      event.stopPropagation()
      return false
    }
    
    // Ctrl+Shift+I (개발자 도구) 방지
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'i') {
      event.preventDefault()
      event.stopPropagation()
      return false
    }
    
    // Ctrl+Shift+J (콘솔) 방지
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'j') {
      event.preventDefault()
      event.stopPropagation()
      return false
    }
    
    // Ctrl+U (소스 보기) 방지
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'u') {
      event.preventDefault()
      event.stopPropagation()
      return false
    }
  }
  
  return true
}

/**
 * 우클릭 방지
 */
export function preventContextMenu(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  return false
}

/**
 * 드래그 방지
 */
export function preventDrag(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  return false
}

/**
 * 클립보드 복사 방지
 */
export function preventCopy(event: ClipboardEvent) {
  const selection = window.getSelection()
  if (!selection || selection.toString().trim() === '') {
    event.preventDefault()
    event.stopPropagation()
    return false
  }
  return true
}

// 화면 공유 허용 플래그 (라이브룸에서 화면 공유 시 사용)
let isScreenSharingAllowed = false
let originalGetDisplayMedia: typeof navigator.mediaDevices.getDisplayMedia | null = null
let isWrapperInstalled = false

/**
 * 화면 공유 허용 설정 (라이브룸에서 화면 공유 시 호출)
 */
export function allowScreenSharing() {
  console.log('✅ [CaptureProtection] 화면 공유 허용')
  isScreenSharingAllowed = true
}

/**
 * 화면 공유 허용 해제
 */
export function disallowScreenSharing() {
  console.log('🚫 [CaptureProtection] 화면 공유 허용 해제')
  isScreenSharingAllowed = false
}

/**
 * 화면 공유/녹화 감지
 */
async function detectScreenCapture() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) return
  
  // 이미 래퍼가 설치되어 있으면 스킵
  if (isWrapperInstalled) return
  
  try {
    // getDisplayMedia가 호출되면 화면 공유 시도 감지
    if (navigator.mediaDevices.getDisplayMedia) {
      // 원본 함수 저장 (한 번만)
      if (!originalGetDisplayMedia) {
        originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices)
      }
      
      // 래퍼 함수 설치
      navigator.mediaDevices.getDisplayMedia = async function(constraints?: DisplayMediaStreamOptions) {
        console.log('📹 [CaptureProtection] getDisplayMedia 호출됨, 허용 플래그:', isScreenSharingAllowed)
        
        // 화면 공유 허용 플래그가 설정되어 있으면 원본 함수 호출
        if (isScreenSharingAllowed && originalGetDisplayMedia) {
          console.log('✅ [CaptureProtection] 화면 공유 허용 - 원본 함수 호출')
          return originalGetDisplayMedia(constraints)
        }
        
        // 그렇지 않으면 차단
        console.log('🚫 [CaptureProtection] 화면 공유 차단')
        blurContent()
        showScreenshotOverlay()
        throw new Error('Screen capture is not allowed')
      }
      
      isWrapperInstalled = true
      console.log('🔒 [CaptureProtection] 화면 공유 감지 래퍼 설치 완료')
    }
  } catch (error) {
    console.error('❌ [CaptureProtection] detectScreenCapture 오류:', error)
  }
}

/**
 * visibility change 감지 (탭 전환, 화면 녹화 도구 등)
 */
function handleVisibilityChange() {
  if (document.hidden || document.visibilityState === 'hidden') {
    blurContent()
  } else {
    // 약간의 딜레이 후 블러 해제 (캡처 도구 대응)
    setTimeout(unblurContent, 500)
  }
}

/**
 * 포커스 변경 감지
 */
function handleFocusChange() {
  if (!document.hasFocus()) {
    blurContent()
  } else {
    // 포커스 복귀 시 딜레이 후 블러 해제 (캡처 도구 대응)
    setTimeout(unblurContent, 500)
  }
}

/**
 * 주기적 포커스 체크 (게임바 등 OS 레벨 캡처 대응)
 */
let focusCheckInterval: ReturnType<typeof setInterval> | null = null

function startFocusCheck() {
  if (focusCheckInterval) return
  
  // 사용자 활동 시 블러 해제
  const updateActivity = () => {
    if (isContentBlurred && document.hasFocus()) {
      unblurContent()
    }
  }
  
  document.addEventListener('mousemove', updateActivity)
  document.addEventListener('click', updateActivity)
  document.addEventListener('scroll', updateActivity)
  document.addEventListener('touchstart', updateActivity)
  
  focusCheckInterval = setInterval(() => {
    // 포커스가 없으면 블러
    if (!document.hasFocus()) {
      blurContent()
    }
  }, 200) // 200ms마다 체크
}

function stopFocusCheck() {
  if (focusCheckInterval) {
    clearInterval(focusCheckInterval)
    focusCheckInterval = null
  }
}

/**
 * 개발자 도구 감지 (localhost에서는 비활성화)
 */
function detectDevTools() {
  // localhost에서는 개발자 도구 감지 비활성화
  if (isLocalhost) return
  
  const threshold = 200 // 오탐지 방지를 위해 threshold 증가
  
  const check = () => {
    const widthThreshold = window.outerWidth - window.innerWidth > threshold
    const heightThreshold = window.outerHeight - window.innerHeight > threshold
    
    if (widthThreshold || heightThreshold) {
      blurContent()
    }
  }
  
  // 주기적 체크
  setInterval(check, 2000) // 2초마다 체크 (성능 개선)
  window.addEventListener('resize', check)
}

/**
 * 네이티브 앱 캡처 방지 설정
 */
export async function setupNativeCaptureProtection() {
  if (!Capacitor.isNativePlatform()) return
  
  // 네이티브 앱에서는 추가적인 CSS 보호 적용
  if (typeof document !== 'undefined') {
    document.body.style.setProperty('-webkit-touch-callout', 'none')
    document.body.style.setProperty('-webkit-user-select', 'none')
  }
  
  // Android/iOS 네이티브 캡처 방지는 별도 플러그인 필요
  // 현재는 웹 기반 보호만 적용
}

/**
 * 네이티브 앱 캡처 방지 해제
 */
export async function disableNativeCaptureProtection() {
  if (!Capacitor.isNativePlatform()) return
  
  if (typeof document !== 'undefined') {
    document.body.style.removeProperty('-webkit-touch-callout')
    document.body.style.removeProperty('-webkit-user-select')
  }
}

/**
 * 웹 캡처 방지 이벤트 리스너 등록
 */
export function setupWebCaptureProtection() {
  if (typeof window === 'undefined') return
  
  // CSS 스타일 주입
  injectCaptureProtectionStyles()
  
  // 키보드 단축키 방지 (캡처 단계에서 차단)
  window.addEventListener('keydown', preventKeyboardCapture, true)
  window.addEventListener('keyup', (e) => {
    if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
      e.preventDefault()
      blurContent()
      showScreenshotOverlay()
      setTimeout(unblurContent, 1500)
    }
  }, true)
  
  // 우클릭 방지
  document.addEventListener('contextmenu', preventContextMenu, true)
  
  // 드래그 방지
  document.addEventListener('dragstart', preventDrag, true)
  
  // 복사 방지
  document.addEventListener('copy', preventCopy, true)
  
  // visibility change 감지
  document.addEventListener('visibilitychange', handleVisibilityChange)
  
  // 포커스 변경 감지
  window.addEventListener('blur', handleFocusChange)
  window.addEventListener('focus', handleFocusChange)
  
  // 주기적 포커스 체크 시작 (게임바 등 OS 레벨 캡처 대응)
  startFocusCheck()
  
  // 화면 공유/녹화 감지
  detectScreenCapture()
  
  // 개발자 도구 감지
  detectDevTools()
  
  // beforeprint 이벤트 (인쇄 시도 감지)
  window.addEventListener('beforeprint', () => {
    blurContent()
  })
  
  window.addEventListener('afterprint', () => {
    unblurContent()
  })
}

/**
 * 웹 캡처 방지 이벤트 리스너 해제
 */
export function cleanupWebCaptureProtection() {
  if (typeof window === 'undefined') return
  
  window.removeEventListener('keydown', preventKeyboardCapture, true)
  document.removeEventListener('contextmenu', preventContextMenu, true)
  document.removeEventListener('dragstart', preventDrag, true)
  document.removeEventListener('copy', preventCopy, true)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('blur', handleFocusChange)
  window.removeEventListener('focus', handleFocusChange)
  
  // 주기적 포커스 체크 중지
  stopFocusCheck()
}

/**
 * 캡처 방지 전체 설정
 */
export async function enableCaptureProtection() {
  setupWebCaptureProtection()
  await setupNativeCaptureProtection()
}

/**
 * 캡처 방지 전체 해제
 */
export async function disableCaptureProtection() {
  cleanupWebCaptureProtection()
  await disableNativeCaptureProtection()
}
