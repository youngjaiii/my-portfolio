/**
 * 날짜 관련 유틸리티 함수
 */

/**
 * 현재 주의 시작일과 종료일 계산
 * 주의 시작일은 월요일 00:00:00, 종료일은 일요일 23:59:59
 * @returns { start: Date, end: Date } 주의 시작일(월요일 00:00)과 종료일(일요일 23:59:59)
 */
export function getCurrentWeekRange(): { start: Date; end: Date } {
  const now = new Date()
  const day = now.getDay() // 0: 일요일, 1: 월요일, ..., 6: 토요일
  const diff = day === 0 ? -6 : 1 - day // 월요일까지의 차이
  
  const start = new Date(now)
  start.setDate(now.getDate() + diff)
  start.setHours(0, 0, 0, 0)
  
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  
  return { start, end }
}

/**
 * 주 기간을 포맷팅
 * @param start 시작일
 * @param end 종료일
 * @returns "12/25 ~ 12/31" 형식의 문자열
 */
export function formatWeekRange(start: Date, end: Date): string {
  const startStr = `${start.getMonth() + 1}/${start.getDate()}`
  const endStr = `${end.getMonth() + 1}/${end.getDate()}`
  return `${startStr} ~ ${endStr}`
}

/**
 * 현재 주 기간을 포맷팅된 문자열로 반환
 * @returns "12/25 ~ 12/31" 형식의 문자열
 */
export function getCurrentWeekRangeFormatted(): string {
  const { start, end } = getCurrentWeekRange()
  return formatWeekRange(start, end)
}

