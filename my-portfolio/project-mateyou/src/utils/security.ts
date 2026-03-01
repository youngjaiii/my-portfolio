/**
 * XSS 방어를 위한 보안 유틸리티
 */

// HTML 특수문자를 이스케이프
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
}

/**
 * HTML 특수문자를 이스케이프하여 XSS 공격 방지
 * React JSX는 기본적으로 이스케이프하지만, dangerouslySetInnerHTML 사용 시 필요
 */
export function escapeHtml(str: string): string {
  if (typeof str !== 'string') return ''
  return str.replace(/[&<>"'`=/]/g, (char) => HTML_ESCAPE_MAP[char] || char)
}

/**
 * URL이 안전한지 검증 (javascript:, data: 프로토콜 차단)
 */
export function isSafeUrl(url: string): boolean {
  if (typeof url !== 'string') return false

  const trimmedUrl = url.trim().toLowerCase()

  // javascript:, data:, vbscript: 등 위험한 프로토콜 차단
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:']
  for (const protocol of dangerousProtocols) {
    if (trimmedUrl.startsWith(protocol)) {
      return false
    }
  }

  return true
}

/**
 * URL을 안전하게 처리 (위험한 URL은 빈 문자열 반환)
 */
export function sanitizeUrl(url: string): string {
  return isSafeUrl(url) ? url : ''
}

/**
 * 사용자 입력에서 잠재적으로 위험한 HTML 태그 제거
 * 간단한 텍스트 입력용 (복잡한 HTML은 DOMPurify 권장)
 */
export function stripHtmlTags(str: string): string {
  if (typeof str !== 'string') return ''
  return str.replace(/<[^>]*>/g, '')
}

/**
 * 스크립트 태그 및 이벤트 핸들러 제거
 */
export function removeScripts(str: string): string {
  if (typeof str !== 'string') return ''

  return str
    // script 태그 제거
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // 이벤트 핸들러 속성 제거 (onclick, onerror 등)
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '')
}

/**
 * 입력값 정규화 (앞뒤 공백 제거, 연속 공백 하나로)
 */
export function normalizeInput(str: string): string {
  if (typeof str !== 'string') return ''
  return str.trim().replace(/\s+/g, ' ')
}

/**
 * 종합적인 텍스트 입력 sanitization
 */
export function sanitizeTextInput(str: string): string {
  if (typeof str !== 'string') return ''
  return normalizeInput(stripHtmlTags(str))
}
