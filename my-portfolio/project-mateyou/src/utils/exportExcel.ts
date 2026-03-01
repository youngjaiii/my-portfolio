import XLSX from 'xlsx-js-style'

// 출근 통계 엑셀 내보내기 유틸리티

interface AttendanceRecord {
  id: string
  date: string
  started_at: string
  ended_at?: string
  work_hours: number
  break_hours: number
  gross_hours: number
  total_break_minutes: number
  store_id?: string
  store_name?: string
  break_records?: Array<{
    id: string
    started_at: string
    ended_at?: string
  }>
}

interface PartnerStats {
  partner_plus_id: string
  partner_plus_name: string
  partner_plus_image?: string
  total_work_hours: number
  total_break_hours: number
  records: AttendanceRecord[]
}

interface StoreStats {
  store_id: string
  store_name: string
  total_work_count: number
  total_work_hours: number
  total_break_hours: number
  partners: Array<{
    partner_plus_id: string
    partner_plus_name: string
    work_hours: number
    break_hours: number
    work_count: number
  }>
}

interface AttendanceStats {
  summary: {
    total_partners: number
    total_stores: number
    total_work_hours: number
    total_break_hours: number
  }
  by_partner: PartnerStats[]
  by_store: StoreStats[]
}

// 매장 스케줄 타입 (DB에서 가져온 설정)
interface StoreScheduleConfig {
  storeId: string
  storeName: string
  weekday_start_hour: number
  weekday_start_minute: number
  weekday_end_hour: number
  weekday_end_minute: number
  weekend_start_hour: number
  weekend_start_minute: number
  weekend_end_hour: number
  weekend_end_minute: number
  late_threshold_minutes: number
  early_leave_threshold_minutes: number
  overtime_threshold_minutes: number
  undertime_threshold_minutes: number
}

interface ExportOptions {
  stats: AttendanceStats
  dateRange: { startDate: string; endDate: string }
  storeName?: string
  partnerNames?: string[]
  storeSchedules?: StoreScheduleConfig[] // DB에서 가져온 매장별 설정
}

// 매장별 근무 기준 시간 설정
interface WorkSchedule {
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
  expectedWorkHours: number
  lateThreshold: number
  earlyLeaveThreshold: number
  overtimeThreshold: number
  undertimeThreshold: number
}

// 스타일 정의
const styles = {
  // 제목 스타일
  title: {
    font: { bold: true, sz: 18, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '4F46E5' } }, // 인디고
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: '4F46E5' } },
      bottom: { style: 'thin', color: { rgb: '4F46E5' } },
      left: { style: 'thin', color: { rgb: '4F46E5' } },
      right: { style: 'thin', color: { rgb: '4F46E5' } },
    },
  },
  // 섹션 헤더 스타일
  sectionHeader: {
    font: { bold: true, sz: 12, color: { rgb: '1E40AF' } },
    fill: { fgColor: { rgb: 'E0E7FF' } }, // 인디고 100
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'C7D2FE' } },
      bottom: { style: 'thin', color: { rgb: 'C7D2FE' } },
      left: { style: 'thin', color: { rgb: 'C7D2FE' } },
      right: { style: 'thin', color: { rgb: 'C7D2FE' } },
    },
  },
  // 테이블 헤더 스타일
  tableHeader: {
    font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '6366F1' } }, // 인디고 500
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: '4F46E5' } },
      bottom: { style: 'thin', color: { rgb: '4F46E5' } },
      left: { style: 'thin', color: { rgb: '4F46E5' } },
      right: { style: 'thin', color: { rgb: '4F46E5' } },
    },
  },
  // 일반 셀 스타일
  cell: {
    font: { sz: 10 },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'E2E8F0' } },
      bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
      left: { style: 'thin', color: { rgb: 'E2E8F0' } },
      right: { style: 'thin', color: { rgb: 'E2E8F0' } },
    },
  },
  // 짝수 행 스타일
  cellEven: {
    font: { sz: 10 },
    fill: { fgColor: { rgb: 'F8FAFC' } }, // 슬레이트 50
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'E2E8F0' } },
      bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
      left: { style: 'thin', color: { rgb: 'E2E8F0' } },
      right: { style: 'thin', color: { rgb: 'E2E8F0' } },
    },
  },
  // 숫자 셀 스타일
  numberCell: {
    font: { sz: 10 },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'E2E8F0' } },
      bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
      left: { style: 'thin', color: { rgb: 'E2E8F0' } },
      right: { style: 'thin', color: { rgb: 'E2E8F0' } },
    },
  },
  // 합계 행 스타일
  totalRow: {
    font: { bold: true, sz: 11, color: { rgb: '1E293B' } },
    fill: { fgColor: { rgb: 'FEF3C7' } }, // 앰버 100
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'medium', color: { rgb: 'F59E0B' } },
      bottom: { style: 'medium', color: { rgb: 'F59E0B' } },
      left: { style: 'thin', color: { rgb: 'F59E0B' } },
      right: { style: 'thin', color: { rgb: 'F59E0B' } },
    },
  },
  // 정상 상태 스타일
  statusNormal: {
    font: { sz: 10, color: { rgb: '059669' } }, // 에메랄드
    fill: { fgColor: { rgb: 'D1FAE5' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'A7F3D0' } },
      bottom: { style: 'thin', color: { rgb: 'A7F3D0' } },
      left: { style: 'thin', color: { rgb: 'A7F3D0' } },
      right: { style: 'thin', color: { rgb: 'A7F3D0' } },
    },
  },
  // 지각 상태 스타일
  statusLate: {
    font: { sz: 10, bold: true, color: { rgb: 'DC2626' } }, // 레드
    fill: { fgColor: { rgb: 'FEE2E2' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'FECACA' } },
      bottom: { style: 'thin', color: { rgb: 'FECACA' } },
      left: { style: 'thin', color: { rgb: 'FECACA' } },
      right: { style: 'thin', color: { rgb: 'FECACA' } },
    },
  },
  // 조기퇴근 상태 스타일
  statusEarlyLeave: {
    font: { sz: 10, bold: true, color: { rgb: 'D97706' } }, // 앰버
    fill: { fgColor: { rgb: 'FEF3C7' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'FDE68A' } },
      bottom: { style: 'thin', color: { rgb: 'FDE68A' } },
      left: { style: 'thin', color: { rgb: 'FDE68A' } },
      right: { style: 'thin', color: { rgb: 'FDE68A' } },
    },
  },
  // 시간미달 상태 스타일
  statusUnderTime: {
    font: { sz: 10, bold: true, color: { rgb: '7C3AED' } }, // 바이올렛
    fill: { fgColor: { rgb: 'EDE9FE' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'DDD6FE' } },
      bottom: { style: 'thin', color: { rgb: 'DDD6FE' } },
      left: { style: 'thin', color: { rgb: 'DDD6FE' } },
      right: { style: 'thin', color: { rgb: 'DDD6FE' } },
    },
  },
  // 시간초과 상태 스타일
  statusOverTime: {
    font: { sz: 10, color: { rgb: '0284C7' } }, // 스카이
    fill: { fgColor: { rgb: 'E0F2FE' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'BAE6FD' } },
      bottom: { style: 'thin', color: { rgb: 'BAE6FD' } },
      left: { style: 'thin', color: { rgb: 'BAE6FD' } },
      right: { style: 'thin', color: { rgb: 'BAE6FD' } },
    },
  },
  // 근무중 상태 스타일
  statusWorking: {
    font: { sz: 10, color: { rgb: '0891B2' } }, // 시안
    fill: { fgColor: { rgb: 'CFFAFE' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'A5F3FC' } },
      bottom: { style: 'thin', color: { rgb: 'A5F3FC' } },
      left: { style: 'thin', color: { rgb: 'A5F3FC' } },
      right: { style: 'thin', color: { rgb: 'A5F3FC' } },
    },
  },
  // 지각+조기퇴근 상태 스타일
  statusBoth: {
    font: { sz: 10, bold: true, color: { rgb: 'BE185D' } }, // 핑크
    fill: { fgColor: { rgb: 'FCE7F3' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'FBCFE8' } },
      bottom: { style: 'thin', color: { rgb: 'FBCFE8' } },
      left: { style: 'thin', color: { rgb: 'FBCFE8' } },
      right: { style: 'thin', color: { rgb: 'FBCFE8' } },
    },
  },
  // 메이드 매장 표시 스타일
  maidStore: {
    font: { sz: 10, color: { rgb: 'DB2777' } }, // 핑크
    fill: { fgColor: { rgb: 'FDF2F8' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'FBCFE8' } },
      bottom: { style: 'thin', color: { rgb: 'FBCFE8' } },
      left: { style: 'thin', color: { rgb: 'FBCFE8' } },
      right: { style: 'thin', color: { rgb: 'FBCFE8' } },
    },
  },
  // 기타 매장 표시 스타일
  otherStore: {
    font: { sz: 10, color: { rgb: '0369A1' } }, // 스카이
    fill: { fgColor: { rgb: 'F0F9FF' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'BAE6FD' } },
      bottom: { style: 'thin', color: { rgb: 'BAE6FD' } },
      left: { style: 'thin', color: { rgb: 'BAE6FD' } },
      right: { style: 'thin', color: { rgb: 'BAE6FD' } },
    },
  },
  // Y 표시 스타일 (문제있음)
  yesCell: {
    font: { sz: 10, bold: true, color: { rgb: 'DC2626' } },
    fill: { fgColor: { rgb: 'FEE2E2' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'FECACA' } },
      bottom: { style: 'thin', color: { rgb: 'FECACA' } },
      left: { style: 'thin', color: { rgb: 'FECACA' } },
      right: { style: 'thin', color: { rgb: 'FECACA' } },
    },
  },
  // N 표시 스타일 (정상)
  noCell: {
    font: { sz: 10, color: { rgb: '64748B' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'E2E8F0' } },
      bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
      left: { style: 'thin', color: { rgb: 'E2E8F0' } },
      right: { style: 'thin', color: { rgb: 'E2E8F0' } },
    },
  },
  // 요약 정보 라벨
  infoLabel: {
    font: { bold: true, sz: 11, color: { rgb: '475569' } },
    fill: { fgColor: { rgb: 'F1F5F9' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'E2E8F0' } },
      bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
      left: { style: 'thin', color: { rgb: 'E2E8F0' } },
      right: { style: 'thin', color: { rgb: 'E2E8F0' } },
    },
  },
  // 요약 정보 값
  infoValue: {
    font: { sz: 11, color: { rgb: '1E293B' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'E2E8F0' } },
      bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
      left: { style: 'thin', color: { rgb: 'E2E8F0' } },
      right: { style: 'thin', color: { rgb: 'E2E8F0' } },
    },
  },
  // 통계 숫자 스타일 (강조)
  statNumber: {
    font: { bold: true, sz: 14, color: { rgb: '4F46E5' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'E2E8F0' } },
      bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
      left: { style: 'thin', color: { rgb: 'E2E8F0' } },
      right: { style: 'thin', color: { rgb: 'E2E8F0' } },
    },
  },
}

// 매장별 고정 색상 (5개 매장)
const STORE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  메이드: { bg: 'FDF2F8', text: 'BE185D', border: 'FBCFE8' }, // 핑크
  마츠리: { bg: 'FEF3C7', text: 'B45309', border: 'FDE68A' }, // 앰버/골드
  데빌: { bg: 'FEE2E2', text: 'DC2626', border: 'FECACA' }, // 레드
  이세카이: { bg: 'E0E7FF', text: '4338CA', border: 'C7D2FE' }, // 인디고
  누아르: { bg: '1E293B', text: 'F1F5F9', border: '475569' }, // 다크 (누아르=검정)
}

// 기본 색상 (매칭 안될 경우)
const DEFAULT_STORE_COLOR = { bg: 'F1F5F9', text: '475569', border: 'E2E8F0' } // 슬레이트

// 가게명으로 색상 찾기 (부분 매칭)
function getStoreColor(storeName: string): { bg: string; text: string; border: string } {
  if (!storeName) return DEFAULT_STORE_COLOR

  // 정확히 일치하거나 포함하는 경우 찾기
  for (const [key, color] of Object.entries(STORE_COLORS)) {
    if (storeName.includes(key)) {
      return color
    }
  }

  return DEFAULT_STORE_COLOR
}

// 가게명으로 색상 스타일 가져오기
function getStoreStyle(storeName: string) {
  const color = getStoreColor(storeName)

  return {
    font: { sz: 10, bold: true, color: { rgb: color.text } },
    fill: { fgColor: { rgb: color.bg } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: color.border } },
      bottom: { style: 'thin', color: { rgb: color.border } },
      left: { style: 'thin', color: { rgb: color.border } },
      right: { style: 'thin', color: { rgb: color.border } },
    },
  }
}

// 스케줄 설정 캐시 (엑셀 생성 시 설정)
let scheduleConfigs: StoreScheduleConfig[] = []

// 스케줄 설정 초기화
function setScheduleConfigs(configs: StoreScheduleConfig[]) {
  scheduleConfigs = configs
}

// 요일에 따른 근무 스케줄 반환 (DB 설정 우선, 없으면 기본값)
function getWorkSchedule(storeName: string, dayOfWeek: number): WorkSchedule {
  // DB에서 가져온 설정 찾기 (정확한 이름 매칭 우선)
  const config = scheduleConfigs.find((c) => c.storeName === storeName)

  if (config) {
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const startHour = isWeekend ? config.weekend_start_hour : config.weekday_start_hour
    const startMinute = isWeekend ? config.weekend_start_minute : config.weekday_start_minute
    const endHour = isWeekend ? config.weekend_end_hour : config.weekday_end_hour
    const endMinute = isWeekend ? config.weekend_end_minute : config.weekday_end_minute
    const expectedWorkHours = (endHour * 60 + endMinute - (startHour * 60 + startMinute)) / 60

    return {
      startHour,
      startMinute,
      endHour,
      endMinute,
      expectedWorkHours,
      lateThreshold: config.late_threshold_minutes,
      earlyLeaveThreshold: config.early_leave_threshold_minutes,
      overtimeThreshold: config.overtime_threshold_minutes,
      undertimeThreshold: config.undertime_threshold_minutes,
    }
  }

  // 기본값 (DB 설정 없는 경우) - 16:00 ~ 22:00
  return { startHour: 16, startMinute: 0, endHour: 22, endMinute: 0, expectedWorkHours: 6, lateThreshold: 5, earlyLeaveThreshold: 5, overtimeThreshold: 30, undertimeThreshold: 30 }
}

function timeToMinutes(hour: number, minute: number): number {
  return hour * 60 + minute
}

function parseTimeToMinutes(timeStr: string): number {
  const [hour, minute] = timeStr.split(':').map(Number)
  return timeToMinutes(hour, minute)
}

function formatTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function getMaxWidth(data: unknown[][], colIndex: number): number {
  let maxLen = 0
  for (const row of data) {
    const cell = row[colIndex]
    if (cell !== null && cell !== undefined) {
      const len = String(cell).length * 2
      if (len > maxLen) maxLen = len
    }
  }
  return Math.min(Math.max(maxLen, 10), 50)
}

// 상태에 따른 스타일 반환
function getStatusStyle(status: string) {
  switch (status) {
    case '정상':
      return styles.statusNormal
    case '지각':
      return styles.statusLate
    case '조기퇴근':
      return styles.statusEarlyLeave
    case '지각+조기퇴근':
      return styles.statusBoth
    case '시간미달':
      return styles.statusUnderTime
    case '시간초과':
      return styles.statusOverTime
    case '근무중':
      return styles.statusWorking
    default:
      return styles.cell
  }
}

interface AttendanceAnalysis {
  isLate: boolean
  lateMinutes: number
  isEarlyLeave: boolean
  earlyLeaveMinutes: number
  expectedWorkHours: number
  actualGrossHours: number // 총 근무시간 (출퇴근 기준, 휴게 미제외)
  workHoursDiff: number // 기준 대비 차이 (양수: 초과, 음수: 미달)
  scheduleStartTime: string
  scheduleEndTime: string
  status: '정상' | '지각' | '조기퇴근' | '지각+조기퇴근' | '근무중' | '시간미달' | '시간초과'
}

function analyzeAttendance(record: AttendanceRecord): AttendanceAnalysis {
  const startDate = new Date(record.started_at)
  const dayOfWeek = startDate.getDay()
  const schedule = getWorkSchedule(record.store_name || '', dayOfWeek)

  const scheduleStartMinutes = timeToMinutes(schedule.startHour, schedule.startMinute)
  const scheduleEndMinutes = timeToMinutes(schedule.endHour, schedule.endMinute)

  const actualStartTime = formatTime(record.started_at)
  const actualStartMinutes = parseTimeToMinutes(actualStartTime)

  const lateMinutes = Math.max(0, actualStartMinutes - scheduleStartMinutes)
  const isLate = lateMinutes > schedule.lateThreshold

  let earlyLeaveMinutes = 0
  let isEarlyLeave = false

  if (record.ended_at) {
    const actualEndTime = formatTime(record.ended_at)
    const actualEndMinutes = parseTimeToMinutes(actualEndTime)
    earlyLeaveMinutes = Math.max(0, scheduleEndMinutes - actualEndMinutes)
    isEarlyLeave = earlyLeaveMinutes > schedule.earlyLeaveThreshold
  }

  const expectedWorkHours = schedule.expectedWorkHours
  // 총 근무시간(출퇴근 시간 기준, 휴게 미제외)으로 비교
  const actualGrossHours = record.gross_hours
  const workHoursDiff = actualGrossHours - expectedWorkHours

  const scheduleStartTime = `${String(schedule.startHour).padStart(2, '0')}:${String(schedule.startMinute).padStart(2, '0')}`
  const scheduleEndTime = `${String(schedule.endHour).padStart(2, '0')}:${String(schedule.endMinute).padStart(2, '0')}`

  // 임계값을 시간으로 변환
  const undertimeThresholdHours = schedule.undertimeThreshold / 60
  const overtimeThresholdHours = schedule.overtimeThreshold / 60

  let status: AttendanceAnalysis['status'] = '정상'
  if (!record.ended_at) {
    status = '근무중'
  } else if (isLate && isEarlyLeave) {
    status = '지각+조기퇴근'
  } else if (isLate) {
    status = '지각'
  } else if (isEarlyLeave) {
    status = '조기퇴근'
  } else if (workHoursDiff < -undertimeThresholdHours) {
    status = '시간미달'
  } else if (workHoursDiff > overtimeThresholdHours) {
    status = '시간초과'
  }

  return {
    isLate,
    lateMinutes,
    isEarlyLeave,
    earlyLeaveMinutes,
    expectedWorkHours,
    actualGrossHours,
    workHoursDiff,
    scheduleStartTime,
    scheduleEndTime,
    status,
  }
}

// 시트에 스타일 적용하는 헬퍼 함수
function applyHeaderStyle(ws: XLSX.WorkSheet, range: string) {
  const ref = XLSX.utils.decode_range(range)
  for (let C = ref.s.c; C <= ref.e.c; C++) {
    const cellAddress = XLSX.utils.encode_cell({ r: ref.s.r, c: C })
    if (ws[cellAddress]) {
      ws[cellAddress].s = styles.tableHeader
    }
  }
}

function applyCellStyles(
  ws: XLSX.WorkSheet,
  startRow: number,
  endRow: number,
  numCols: number,
  statusColIndex?: number,
  storeNameColIndex?: number,
  lateColIndex?: number,
  earlyLeaveColIndex?: number
) {
  for (let R = startRow; R <= endRow; R++) {
    const isEvenRow = (R - startRow) % 2 === 1
    for (let C = 0; C < numCols; C++) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C })
      if (ws[cellAddress]) {
        const cellValue = ws[cellAddress].v

        // 상태 컬럼 스타일
        if (statusColIndex !== undefined && C === statusColIndex) {
          ws[cellAddress].s = getStatusStyle(String(cellValue))
        }
        // 가게명 컬럼 스타일 (가게별 고유 색상)
        else if (storeNameColIndex !== undefined && C === storeNameColIndex) {
          ws[cellAddress].s = getStoreStyle(String(cellValue))
        }
        // 지각 여부 컬럼 스타일
        else if (lateColIndex !== undefined && C === lateColIndex) {
          ws[cellAddress].s = cellValue === 'Y' ? styles.yesCell : styles.noCell
        }
        // 조기퇴근 여부 컬럼 스타일
        else if (earlyLeaveColIndex !== undefined && C === earlyLeaveColIndex) {
          ws[cellAddress].s = cellValue === 'Y' ? styles.yesCell : styles.noCell
        }
        // 일반 셀
        else {
          ws[cellAddress].s = isEvenRow ? styles.cellEven : styles.cell
        }
      }
    }
  }
}

export function exportAttendanceStatsToExcel(options: ExportOptions) {
  const { stats, dateRange, storeName, partnerNames, storeSchedules } = options
  const wb = XLSX.utils.book_new()

  // 스케줄 설정 초기화
  if (storeSchedules && storeSchedules.length > 0) {
    setScheduleConfigs(storeSchedules)
  } else {
    setScheduleConfigs([])
  }


  // 1. 요약 시트 (스타일 적용)
  const summaryData: unknown[][] = [
    [{ v: '📊 출근 통계 보고서', s: styles.title }],
    [],
    [{ v: '조회 기간', s: styles.infoLabel }, { v: `${dateRange.startDate} ~ ${dateRange.endDate}`, s: styles.infoValue }],
    [{ v: '조회 조건', s: styles.infoLabel }, { v: storeName ? `가게: ${storeName}` : '전체 가게', s: styles.infoValue }],
    [
      { v: '선택 파트너', s: styles.infoLabel },
      { v: partnerNames && partnerNames.length > 0 ? partnerNames.join(', ') : '전체 파트너', s: styles.infoValue },
    ],
    [],
    [{ v: '📈 요약 통계', s: styles.sectionHeader }],
    [{ v: '총 파트너 수', s: styles.infoLabel }, { v: stats.summary.total_partners, s: styles.statNumber }, { v: '명', s: styles.infoValue }],
    [{ v: '총 가게 수', s: styles.infoLabel }, { v: stats.summary.total_stores, s: styles.statNumber }, { v: '개', s: styles.infoValue }],
    [
      { v: '총 실 근무시간', s: styles.infoLabel },
      { v: Number(stats.summary.total_work_hours.toFixed(2)), s: styles.statNumber },
      { v: '시간 (휴게 제외)', s: styles.infoValue },
    ],
    [{ v: '총 휴게시간', s: styles.infoLabel }, { v: Number(stats.summary.total_break_hours.toFixed(2)), s: styles.statNumber }, { v: '시간', s: styles.infoValue }],
    [
      { v: '총 근무시간 (휴게 포함)', s: styles.infoLabel },
      { v: Number((stats.summary.total_work_hours + stats.summary.total_break_hours).toFixed(2)), s: styles.statNumber },
      { v: '시간', s: styles.infoValue },
    ],
    [],
    [{ v: '🏪 가게 목록', s: styles.sectionHeader }],
  ]

  // 가게별 색상 범례 추가 (평일/주말 기준 모두 표시)
  stats.by_store.forEach((store) => {
    const weekdaySchedule = getWorkSchedule(store.store_name, 1) // 평일 기준
    const weekendSchedule = getWorkSchedule(store.store_name, 0) // 주말 기준
    const storeStyle = getStoreStyle(store.store_name)

    const weekdayStart = `${String(weekdaySchedule.startHour).padStart(2, '0')}:${String(weekdaySchedule.startMinute).padStart(2, '0')}`
    const weekdayEnd = `${String(weekdaySchedule.endHour).padStart(2, '0')}:${String(weekdaySchedule.endMinute).padStart(2, '0')}`
    const weekendStart = `${String(weekendSchedule.startHour).padStart(2, '0')}:${String(weekendSchedule.startMinute).padStart(2, '0')}`
    const weekendEnd = `${String(weekendSchedule.endHour).padStart(2, '0')}:${String(weekendSchedule.endMinute).padStart(2, '0')}`

    summaryData.push([
      { v: store.store_name, s: storeStyle },
      { v: `평일: ${weekdayStart}~${weekdayEnd} (${weekdaySchedule.expectedWorkHours}h)`, s: styles.cell },
      { v: `주말: ${weekendStart}~${weekendEnd} (${weekendSchedule.expectedWorkHours}h)`, s: styles.cell },
    ])
  })

  // 판정 기준 설명 (첫 번째 매장 기준)
  const firstSchedule = stats.by_store.length > 0 ? getWorkSchedule(stats.by_store[0].store_name, 1) : null
  summaryData.push([])
  summaryData.push([{ v: '⏱️ 판정 기준', s: styles.sectionHeader }])
  if (firstSchedule) {
    summaryData.push([
      { v: '지각', s: styles.yesCell },
      { v: `출근시간 +${firstSchedule.lateThreshold}분 초과 시`, s: styles.cell },
    ])
    summaryData.push([
      { v: '조기퇴근', s: styles.yesCell },
      { v: `퇴근시간 -${firstSchedule.earlyLeaveThreshold}분 전 퇴근 시`, s: styles.cell },
    ])
    summaryData.push([
      { v: '시간미달', s: styles.statusUnderTime },
      { v: `기준 근무시간 -${firstSchedule.undertimeThreshold}분 미달 시`, s: styles.cell },
    ])
    summaryData.push([
      { v: '시간초과', s: styles.statusOverTime },
      { v: `기준 근무시간 +${firstSchedule.overtimeThreshold}분 초과 시`, s: styles.cell },
    ])
  }

  // 상태 범례
  summaryData.push([])
  summaryData.push([{ v: '🏷️ 상태 범례', s: styles.sectionHeader }])
  summaryData.push([{ v: '정상', s: styles.statusNormal }, { v: '기준 시간 내 출퇴근', s: styles.cell }])
  summaryData.push([{ v: '지각', s: styles.statusLate }, { v: '기준 출근시간 초과', s: styles.cell }])
  summaryData.push([{ v: '조기퇴근', s: styles.statusEarlyLeave }, { v: '기준 퇴근시간 전 퇴근', s: styles.cell }])
  summaryData.push([{ v: '시간미달', s: styles.statusUnderTime }, { v: '기준 근무시간 미달', s: styles.cell }])
  summaryData.push([{ v: '시간초과', s: styles.statusOverTime }, { v: '기준 근무시간 초과', s: styles.cell }])
  summaryData.push([{ v: '근무중', s: styles.statusWorking }, { v: '아직 퇴근하지 않음', s: styles.cell }])

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
  summarySheet['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 25 }]
  summarySheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }] // 제목 병합
  XLSX.utils.book_append_sheet(wb, summarySheet, '요약')

  // 2. 파트너별 요약 시트
  const partnerSummaryHeader = [
    '파트너명',
    '총 출근',
    '실 근무 (h)',
    '휴게 (h)',
    '총 시간 (h)',
    '일평균 (h)',
    '정상',
    '지각',
    '조기퇴근',
    '시간미달',
    '시간초과',
    '총 지각 (분)',
    '근무 가게',
  ]
  const partnerSummaryRows = stats.by_partner.map((partner) => {
    const uniqueStores = new Map<string, string>()
    partner.records.forEach((record) => {
      if (record.store_id && record.store_name) {
        uniqueStores.set(record.store_id, record.store_name)
      }
    })
    const storeList = Array.from(uniqueStores.values()).join(', ')
    const totalRecords = partner.records.length
    const avgWorkHours = totalRecords > 0 ? partner.total_work_hours / totalRecords : 0

    let normalCount = 0
    let lateCount = 0
    let earlyLeaveCount = 0
    let underTimeCount = 0
    let overTimeCount = 0
    let totalLateMinutes = 0

    partner.records.forEach((record) => {
      const analysis = analyzeAttendance(record)
      if (analysis.status === '정상') normalCount++
      if (analysis.isLate) {
        lateCount++
        totalLateMinutes += analysis.lateMinutes
      }
      if (analysis.isEarlyLeave) earlyLeaveCount++
      if (analysis.status === '시간미달') underTimeCount++
      if (analysis.status === '시간초과') overTimeCount++
    })

    return [
      partner.partner_plus_name,
      totalRecords,
      Number(partner.total_work_hours.toFixed(2)),
      Number(partner.total_break_hours.toFixed(2)),
      Number((partner.total_work_hours + partner.total_break_hours).toFixed(2)),
      Number(avgWorkHours.toFixed(2)),
      normalCount,
      lateCount,
      earlyLeaveCount,
      underTimeCount,
      overTimeCount,
      totalLateMinutes,
      storeList,
    ]
  })

  const partnerSummaryData = [partnerSummaryHeader, ...partnerSummaryRows]
  const partnerSummarySheet = XLSX.utils.aoa_to_sheet(partnerSummaryData)
  partnerSummarySheet['!cols'] = partnerSummaryHeader.map((_, i) => ({ wch: getMaxWidth(partnerSummaryData, i) }))
  partnerSummarySheet['!autofilter'] = { ref: `A1:M${partnerSummaryRows.length + 1}` }
  applyHeaderStyle(partnerSummarySheet, `A1:M1`)
  applyCellStyles(partnerSummarySheet, 1, partnerSummaryRows.length, 13)
  XLSX.utils.book_append_sheet(wb, partnerSummarySheet, '파트너별 요약')

  // 3. 가게별 요약 시트
  const storeSummaryHeader = ['가게명', '기준 시작', '기준 종료', '총 출근', '실 근무 (h)', '휴게 (h)', '총 시간 (h)', '파트너 수', '파트너 목록']
  const storeSummaryRows = stats.by_store.map((store) => {
    const partnerList = store.partners.map((p) => p.partner_plus_name).join(', ')
    const schedule = getWorkSchedule(store.store_name, 1)
    const scheduleStart = `${String(schedule.startHour).padStart(2, '0')}:${String(schedule.startMinute).padStart(2, '0')}`
    const scheduleEnd = `${String(schedule.endHour).padStart(2, '0')}:${String(schedule.endMinute).padStart(2, '0')}`

    return [store.store_name, scheduleStart, scheduleEnd, store.total_work_count, Number(store.total_work_hours.toFixed(2)), Number(store.total_break_hours.toFixed(2)), Number((store.total_work_hours + store.total_break_hours).toFixed(2)), store.partners.length, partnerList]
  })

  const storeSummaryData = [storeSummaryHeader, ...storeSummaryRows]
  const storeSummarySheet = XLSX.utils.aoa_to_sheet(storeSummaryData)
  storeSummarySheet['!cols'] = storeSummaryHeader.map((_, i) => ({ wch: getMaxWidth(storeSummaryData, i) }))
  storeSummarySheet['!autofilter'] = { ref: `A1:I${storeSummaryRows.length + 1}` }
  applyHeaderStyle(storeSummarySheet, `A1:I1`)
  applyCellStyles(storeSummarySheet, 1, storeSummaryRows.length, 9, undefined, 0)
  XLSX.utils.book_append_sheet(wb, storeSummarySheet, '가게별 요약')

  // 4. 전체 상세 기록 시트
  const detailHeader = ['날짜', '요일', '파트너명', '가게명', '기준출근', '기준퇴근', '실출근', '실퇴근', '총근무(h)', '휴게횟수', '휴게(분)', '휴게(h)', '실근무(h)', '기준(h)', '차이(h)', '지각', '지각(분)', '조퇴', '조퇴(분)', '상태', '휴게상세']

  const dayNames = ['일', '월', '화', '수', '목', '금', '토']
  const detailRows: (string | number)[][] = []

  stats.by_partner.forEach((partner) => {
    partner.records.forEach((record) => {
      const startDate = new Date(record.started_at)
      const dayOfWeek = startDate.getDay()
      const analysis = analyzeAttendance(record)

      const breakRecordCount = record.break_records?.length || (record.break_hours > 0 ? 1 : 0)
      const breakDetails =
        record.break_records && record.break_records.length > 0
          ? record.break_records
              .map((br) => {
                const start = formatTime(br.started_at)
                const end = br.ended_at ? formatTime(br.ended_at) : '진행중'
                return `${start}~${end}`
              })
              .join(' / ')
          : record.break_hours > 0
            ? `${Math.floor(record.break_hours * 60)}분`
            : '-'

      detailRows.push([
        record.date,
        dayNames[dayOfWeek],
        partner.partner_plus_name,
        record.store_name || '-',
        analysis.scheduleStartTime,
        analysis.scheduleEndTime,
        formatTime(record.started_at),
        record.ended_at ? formatTime(record.ended_at) : '진행중',
        Number(record.gross_hours.toFixed(2)),
        breakRecordCount,
        record.total_break_minutes,
        Number(record.break_hours.toFixed(2)),
        Number(record.work_hours.toFixed(2)),
        analysis.expectedWorkHours,
        Number(analysis.workHoursDiff.toFixed(2)),
        analysis.isLate ? 'Y' : 'N',
        analysis.lateMinutes,
        analysis.isEarlyLeave ? 'Y' : 'N',
        analysis.earlyLeaveMinutes,
        analysis.status,
        breakDetails,
      ])
    })
  })

  detailRows.sort((a, b) => {
    const dateCompare = String(a[0]).localeCompare(String(b[0]))
    if (dateCompare !== 0) return dateCompare
    return String(a[2]).localeCompare(String(b[2]))
  })

  const detailData = [detailHeader, ...detailRows]
  const detailSheet = XLSX.utils.aoa_to_sheet(detailData)
  detailSheet['!cols'] = detailHeader.map((_, i) => ({ wch: getMaxWidth(detailData, i) }))
  detailSheet['!autofilter'] = { ref: `A1:U${detailRows.length + 1}` }
  applyHeaderStyle(detailSheet, `A1:U1`)
  // 상태: 19, 가게명: 3, 지각: 15, 조퇴: 17
  applyCellStyles(detailSheet, 1, detailRows.length, 21, 19, 3, 15, 17)
  XLSX.utils.book_append_sheet(wb, detailSheet, '상세 기록')

  // 5. 이상 기록 시트
  const abnormalRows = detailRows.filter((row) => {
    const status = row[19] as string // 상태 컬럼은 인덱스 19
    return status !== '정상' && status !== '근무중' && status !== '시간초과'
  })

  if (abnormalRows.length > 0) {
    const abnormalData = [detailHeader, ...abnormalRows]
    const abnormalSheet = XLSX.utils.aoa_to_sheet(abnormalData)
    abnormalSheet['!cols'] = detailHeader.map((_, i) => ({ wch: getMaxWidth(abnormalData, i) }))
    abnormalSheet['!autofilter'] = { ref: `A1:U${abnormalRows.length + 1}` }
    applyHeaderStyle(abnormalSheet, `A1:U1`)
    // 상태: 19, 가게명: 3, 지각: 15, 조퇴: 17
    applyCellStyles(abnormalSheet, 1, abnormalRows.length, 21, 19, 3, 15, 17)
    XLSX.utils.book_append_sheet(wb, abnormalSheet, '⚠️ 이상기록')
  }

  // 6. 가게별 상세 기록 시트
  stats.by_store.forEach((store) => {
    const storeDetailHeader = ['날짜', '요일', '파트너명', '기준출근', '기준퇴근', '실출근', '실퇴근', '총근무(h)', '휴게(분)', '휴게(h)', '실근무(h)', '기준(h)', '차이(h)', '지각', '지각(분)', '조퇴', '조퇴(분)', '상태', '휴게상세']

    const storeDetailRows: (string | number)[][] = []

    stats.by_partner.forEach((partner) => {
      partner.records
        .filter((record) => record.store_id === store.store_id)
        .forEach((record) => {
          const startDate = new Date(record.started_at)
          const dayOfWeek = startDate.getDay()
          const analysis = analyzeAttendance(record)

          const breakDetails =
            record.break_records && record.break_records.length > 0
              ? record.break_records
                  .map((br) => {
                    const start = formatTime(br.started_at)
                    const end = br.ended_at ? formatTime(br.ended_at) : '진행중'
                    return `${start}~${end}`
                  })
                  .join(' / ')
              : record.break_hours > 0
                ? `${Math.floor(record.break_hours * 60)}분`
                : '-'

          storeDetailRows.push([
            record.date,
            dayNames[dayOfWeek],
            partner.partner_plus_name,
            analysis.scheduleStartTime,
            analysis.scheduleEndTime,
            formatTime(record.started_at),
            record.ended_at ? formatTime(record.ended_at) : '진행중',
            Number(record.gross_hours.toFixed(2)),
            record.total_break_minutes,
            Number(record.break_hours.toFixed(2)),
            Number(record.work_hours.toFixed(2)),
            analysis.expectedWorkHours,
            Number(analysis.workHoursDiff.toFixed(2)),
            analysis.isLate ? 'Y' : 'N',
            analysis.lateMinutes,
            analysis.isEarlyLeave ? 'Y' : 'N',
            analysis.earlyLeaveMinutes,
            analysis.status,
            breakDetails,
          ])
        })
    })

    storeDetailRows.sort((a, b) => {
      const dateCompare = String(a[0]).localeCompare(String(b[0]))
      if (dateCompare !== 0) return dateCompare
      return String(a[2]).localeCompare(String(b[2]))
    })

    // 합계 행
    const dataRowCount = storeDetailRows.length
    const totalGrossHours = storeDetailRows.reduce((sum, row) => sum + (row[7] as number), 0)
    const totalBreakMinutes = storeDetailRows.reduce((sum, row) => sum + (row[8] as number), 0)
    const totalBreakHours = storeDetailRows.reduce((sum, row) => sum + (row[9] as number), 0)
    const totalWorkHours = storeDetailRows.reduce((sum, row) => sum + (row[10] as number), 0)
    const totalLateCount = storeDetailRows.filter((row) => row[13] === 'Y').length
    const totalEarlyLeaveCount = storeDetailRows.filter((row) => row[15] === 'Y').length
    const totalLateMinutes = storeDetailRows.reduce((sum, row) => sum + (row[14] as number), 0)

    storeDetailRows.push([])
    storeDetailRows.push(['합계', '', `${dataRowCount}건`, '', '', '', '', Number(totalGrossHours.toFixed(2)), totalBreakMinutes, Number(totalBreakHours.toFixed(2)), Number(totalWorkHours.toFixed(2)), '', '', totalLateCount, totalLateMinutes, totalEarlyLeaveCount, '', '', ''])

    const storeDetailData = [storeDetailHeader, ...storeDetailRows]
    const storeDetailSheet = XLSX.utils.aoa_to_sheet(storeDetailData)
    storeDetailSheet['!cols'] = storeDetailHeader.map((_, i) => ({ wch: getMaxWidth(storeDetailData, i) }))
    storeDetailSheet['!autofilter'] = { ref: `A1:S${dataRowCount + 1}` }
    applyHeaderStyle(storeDetailSheet, `A1:S1`)
    applyCellStyles(storeDetailSheet, 1, dataRowCount, 19, 17, undefined, 13, 15)

    // 합계 행 스타일
    for (let C = 0; C < 19; C++) {
      const cellAddress = XLSX.utils.encode_cell({ r: dataRowCount + 2, c: C })
      if (storeDetailSheet[cellAddress]) {
        storeDetailSheet[cellAddress].s = styles.totalRow
      }
    }

    const safeStoreName = store.store_name.replace(/[\\/*?:[\]]/g, '').substring(0, 28)
    XLSX.utils.book_append_sheet(wb, storeDetailSheet, `${safeStoreName}`)
  })

  // 7. 파일 다운로드
  const fileName = `출근통계_${dateRange.startDate}_${dateRange.endDate}.xlsx`
  XLSX.writeFile(wb, fileName)
}

// 포인트 로그 타입 정의
interface MemberPointsLog {
  id: string
  member_id: string
  type: 'earn' | 'spend' | 'withdraw'
  amount: number
  description: string | null
  log_id: string | null
  created_at: string
  member_name?: string | null
  member_code?: string | null
}

interface PartnerPointsLog {
  id: string
  partner_id: string
  type: 'earn' | 'spend' | 'withdraw'
  amount: number
  description: string | null
  log_id: string | null
  created_at: string
  partner_name?: string | null
}

interface PointsLogsExportOptions {
  logs: MemberPointsLog[] | PartnerPointsLog[]
  logType: 'member' | 'partner'
  dateRange?: { startDate: string; endDate: string }
  filters?: {
    type?: string
    search?: string
  }
}

export function exportPointsLogsToExcel(options: PointsLogsExportOptions) {
  const { logs, logType, dateRange, filters } = options
  const wb = XLSX.utils.book_new()

  const isMember = logType === 'member'
  const typeLabel = isMember ? '회원' : '파트너'

  // 헤더 정의
  const headers = isMember
    ? ['이름', '회원코드', '타입', '금액', '설명', '일시']
    : ['이름', '타입', '금액', '설명', '일시']

  // 데이터 행 생성
  const rows: (string | number)[][] = logs.map(log => {
    const typeText = log.type === 'earn' ? '적립' : log.type === 'spend' ? '사용' : '출금'
    const amountText = log.type === 'earn' ? log.amount : -log.amount
    const createdAt = new Date(log.created_at).toLocaleString('ko-KR')

    if (isMember) {
      const memberLog = log as MemberPointsLog
      return [
        memberLog.member_name || '알 수 없음',
        memberLog.member_code || '-',
        typeText,
        amountText,
        log.description || '-',
        createdAt,
      ]
    } else {
      const partnerLog = log as PartnerPointsLog
      return [
        partnerLog.partner_name || '알 수 없음',
        typeText,
        amountText,
        log.description || '-',
        createdAt,
      ]
    }
  })

  // 시트 데이터 생성 (헤더 + 데이터)
  const sheetData = [headers, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(sheetData)

  // 컬럼 너비 자동 조절
  const colWidths = headers.map((_, i) => {
    const maxLen = Math.max(
      headers[i].length,
      ...rows.map(row => String(row[i]).length)
    )
    return { wch: Math.min(Math.max(maxLen + 2, 10), 50) }
  })
  ws['!cols'] = colWidths

  // 헤더 스타일 적용
  const headerRange = XLSX.utils.decode_range(`A1:${String.fromCharCode(64 + headers.length)}1`)
  for (let C = headerRange.s.c; C <= headerRange.e.c; C++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C })
    if (ws[cellAddress]) {
      ws[cellAddress].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '4472C4' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } },
        },
      }
    }
  }

  // 데이터 셀 스타일 적용
  const amountColIndex = isMember ? 3 : 2
  for (let R = 1; R <= rows.length; R++) {
    for (let C = 0; C < headers.length; C++) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C })
      if (ws[cellAddress]) {
        const isAmountCol = C === amountColIndex
        const cellValue = rows[R - 1][C]
        ws[cellAddress].s = {
          alignment: {
            horizontal: isAmountCol ? 'right' : 'left',
            vertical: 'center',
          },
          border: {
            top: { style: 'thin', color: { rgb: 'D9D9D9' } },
            bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
            left: { style: 'thin', color: { rgb: 'D9D9D9' } },
            right: { style: 'thin', color: { rgb: 'D9D9D9' } },
          },
          font: isAmountCol
            ? { color: { rgb: Number(cellValue) >= 0 ? '00B050' : 'FF0000' } }
            : undefined,
        }

        // 숫자 포맷 적용
        if (isAmountCol && typeof cellValue === 'number') {
          ws[cellAddress].z = '#,##0'
        }
      }
    }
  }

  // 시트 추가
  XLSX.utils.book_append_sheet(wb, ws, `${typeLabel} 포인트 로그`)

  // 파일명 생성
  let fileName = `${typeLabel}_포인트로그`
  if (dateRange) {
    fileName += `_${dateRange.startDate}_${dateRange.endDate}`
  } else {
    fileName += `_${new Date().toISOString().split('T')[0]}`
  }
  if (filters?.type && filters.type !== 'all') {
    const filterTypeText = filters.type === 'earn' ? '적립' : '사용'
    fileName += `_${filterTypeText}`
  }
  fileName += '.xlsx'

  // 파일 다운로드
  XLSX.writeFile(wb, fileName)
}
