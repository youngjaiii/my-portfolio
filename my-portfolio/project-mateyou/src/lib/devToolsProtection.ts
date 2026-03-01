import { Capacitor } from '@capacitor/core'

/**
 * 데스크탑 PC 브라우저인지 확인 (매우 보수적으로 판단)
 * - 모바일, 태블릿, 터치 기기에서는 false 반환
 * - 확실히 데스크탑 PC일 때만 true 반환
 */
function isDefinitelyDesktopPC(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }
  
  const userAgent = navigator.userAgent || ''
  
  // 모바일/태블릿 패턴이 있으면 PC 아님
  const mobilePatterns = [
    /Android/i,
    /webOS/i,
    /iPhone/i,
    /iPad/i,
    /iPod/i,
    /BlackBerry/i,
    /IEMobile/i,
    /Opera Mini/i,
    /Mobile/i,
    /mobile/i,
    /CriOS/i,           // Chrome on iOS
    /FxiOS/i,           // Firefox on iOS
    /SamsungBrowser/i,  // Samsung Browser
    /UCBrowser/i,       // UC Browser
    /Silk/i,            // Amazon Silk
    /Tablet/i,
    /Touch/i,
    /ARM/i,             // ARM 프로세서 (모바일)
  ]
  
  for (const pattern of mobilePatterns) {
    if (pattern.test(userAgent)) {
      return false
    }
  }
  
  // 터치 지원 기기는 PC 아님
  if ('ontouchstart' in window) {
    return false
  }
  
  if (navigator.maxTouchPoints > 0) {
    return false
  }
  
  // 화면이 작으면 PC 아님 (1280px 이상만 PC로 간주)
  if (window.innerWidth < 1280) {
    return false
  }
  
  // Windows, Mac, Linux PC 패턴 확인
  const desktopPatterns = [
    /Windows NT/i,
    /Macintosh/i,
    /Mac OS X/i,
    /Linux x86_64/i,
    /Linux i686/i,
  ]
  
  for (const pattern of desktopPatterns) {
    if (pattern.test(userAgent)) {
      return true
    }
  }
  
  // 불확실하면 PC 아닌 것으로 처리
  return false
}

/**
 * 개발자 도구 감지 및 차단
 * 확실히 데스크탑 PC + 프로덕션 환경에서만 동작
 */
export function initDevToolsProtection() {
  // 네이티브 앱에서는 비활성화
  if (Capacitor.isNativePlatform()) {
    return
  }

  // 개발 모드에서는 비활성화
  if (import.meta.env.DEV) {
    console.log('🔧 Dev tools protection disabled in development mode')
    return
  }
  
  // 확실히 데스크탑 PC가 아니면 비활성화
  if (!isDefinitelyDesktopPC()) {
    console.log('🔧 Dev tools protection disabled (not desktop PC)')
    return
  }

  // 개발자 도구 감지 시 처리
  const handleDevToolsDetected = () => {
    try {
      // 모든 내용 제거
      document.body.innerHTML = '<div style="background:#000;width:100vw;height:100vh;"></div>'
      document.head.innerHTML = '<title></title>'
      
      // 히스토리 조작
      window.history.pushState(null, '', '/')
      window.history.pushState(null, '', '/')
      window.history.pushState(null, '', '/')
      
      // 빈 페이지로 이동
      setTimeout(() => {
        window.location.href = 'about:blank'
      }, 100)
    } catch {
      window.location.href = 'about:blank'
    }
  }

  // 키보드 단축키 차단 (capture: true로 우선 처리)
  const blockKeyboardShortcuts = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase()
    
    // F12
    if (event.keyCode === 123 || key === 'f12') {
      event.preventDefault()
      event.stopPropagation()
      return false
    }
    
    // Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C (개발자 도구)
    if (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(key)) {
      event.preventDefault()
      event.stopPropagation()
      return false
    }
    
    // Ctrl+U (소스 보기)
    if (event.ctrlKey && key === 'u') {
      event.preventDefault()
      event.stopPropagation()
      return false
    }
    
    // F5 제외한 기능키들
    if (event.keyCode >= 112 && event.keyCode <= 123 && event.keyCode !== 116) {
      event.preventDefault()
      event.stopPropagation()
      return false
    }
  }

  // 우클릭 차단
  const blockContextMenu = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    return false
  }

  // 드래그 차단
  const blockDrag = (event: Event) => {
    event.preventDefault()
    return false
  }

  // 선택 차단
  const blockSelect = (event: Event) => {
    event.preventDefault()
    return false
  }

  // 이벤트 리스너 등록 (capture: true로 먼저 처리)
  document.addEventListener('keydown', blockKeyboardShortcuts, true)
  document.addEventListener('contextmenu', blockContextMenu, true)
  document.addEventListener('dragstart', blockDrag, true)
  document.addEventListener('selectstart', blockSelect, true)
  
  // window에도 등록
  window.addEventListener('keydown', blockKeyboardShortcuts, true)

  // 방법 1: devtools-detect 라이브러리 방식 (콘솔 출력 감지)
  const devtools = {
    isOpen: false,
    orientation: undefined as string | undefined
  }

  const threshold = 170

  const emitEvent = (isOpen: boolean, orientation: string | undefined) => {
    if (devtools.isOpen !== isOpen) {
      devtools.isOpen = isOpen
      devtools.orientation = orientation
      
      if (isOpen) {
        handleDevToolsDetected()
      }
    }
  }

  const checkDevTools = () => {
    const widthThreshold = window.outerWidth - window.innerWidth > threshold
    const heightThreshold = window.outerHeight - window.innerHeight > threshold
    const orientation = widthThreshold ? 'vertical' : 'horizontal'

    if (
      !(heightThreshold && widthThreshold) &&
      ((window.Firebug && window.Firebug.chrome && window.Firebug.chrome.isInitialized) ||
        widthThreshold ||
        heightThreshold)
    ) {
      emitEvent(true, orientation)
    } else {
      emitEvent(false, undefined)
    }
  }

  // 방법 2: console.log 감지
  const element = new Image()
  let consoleCheckCount = 0
  
  Object.defineProperty(element, 'id', {
    get: function () {
      consoleCheckCount++
      if (consoleCheckCount > 1) {
        handleDevToolsDetected()
      }
      return 'devtools-check'
    },
  })

  const checkConsole = () => {
    consoleCheckCount = 0
    console.log('%c', element)
    console.clear()
  }

  // 방법 3: debugger 타이밍 체크 (별도 worker 사용)
  const checkDebugger = () => {
    const start = performance.now()
    // eslint-disable-next-line no-debugger
    debugger
    const end = performance.now()
    
    if (end - start > 100) {
      handleDevToolsDetected()
    }
  }

  // 주기적 체크
  setInterval(checkDevTools, 500)
  setInterval(checkConsole, 1000)
  setInterval(checkDebugger, 3000)
  
  // 초기 체크
  checkDevTools()

  // CSS로 선택 차단
  const style = document.createElement('style')
  style.textContent = `
    * {
      -webkit-user-select: none !important;
      -moz-user-select: none !important;
      -ms-user-select: none !important;
      user-select: none !important;
    }
    input, textarea {
      -webkit-user-select: text !important;
      -moz-user-select: text !important;
      -ms-user-select: text !important;
      user-select: text !important;
    }
  `
  document.head.appendChild(style)

  console.log('🛡️ Dev tools protection enabled')
}

// TypeScript를 위한 window 확장
declare global {
  interface Window {
    Firebug?: {
      chrome?: {
        isInitialized?: boolean
      }
    }
  }
}
