/**
 * MateYou Store 상태전이 규칙 및 검증 함수
 * PRD v1.0 기반 (requirements/PRD.md)
 */

import {
  OrderStatus,
  ORDER_STATUSES,
  ScheduleStatus,
  SCHEDULE_STATUSES,
  isValidOrderStatus,
  isValidScheduleStatus,
} from './store-types.ts';

// ============================================================
// 상태전이 에러 타입
// ============================================================
export class StateTransitionError extends Error {
  constructor(
    public code: string,
    message: string,
    public fromStatus: string,
    public toStatus: string,
    public details?: any
  ) {
    super(message);
    this.name = 'StateTransitionError';
  }
}

export interface StateTransitionResult {
  valid: boolean;
  error?: StateTransitionError;
}

// ============================================================
// 주문 상태전이 규칙
// ============================================================
/**
 * 주문 상태전이 허용 규칙 (표)
 * 
 * from \ to    | pending | paid | shipped | delivered | confirmed | cancelled
 * -------------|---------|------|---------|-----------|-----------|----------
 * pending      |    -    |  ✅  |    ❌   |     ❌     |     ❌     |    ✅
 * paid         |    ❌   |  -   |    ✅   |     ✅     |     ❌     |    ✅
 * shipped      |    ❌   |  ❌  |    -    |     ✅     |     ❌     |    ❌
 * delivered    |    ❌   |  ❌  |    ❌   |     -      |     ✅     |    ❌
 * confirmed    |    ❌   |  ❌  |    ❌   |     ❌     |     -      |    ❌
 * cancelled    |    ❌   |  ❌  |    ❌   |     ❌     |     ❌     |    -
 * 
 * 규칙:
 * - pending → paid: 결제 승인 시
 * - pending → cancelled: 결제 전 취소
 * - paid → shipped: 배송 시작 (delivery 상품)
 * - paid → delivered: 배송 완료 (delivery 상품, 직접 전이 가능)
 * - paid → cancelled: 결제 후 취소 (발송 전)
 * - shipped → delivered: 배송 완료
 * - delivered → confirmed: 구매 확정 (사용자)
 * - confirmed, cancelled: 종료 상태 (추가 전이 불가)
 */
const ORDER_TRANSITION_MAP: Record<OrderStatus, OrderStatus[]> = {
  [ORDER_STATUSES.PENDING]: [ORDER_STATUSES.PAID, ORDER_STATUSES.CANCELLED],
  [ORDER_STATUSES.PAID]: [
    ORDER_STATUSES.SHIPPED,
    ORDER_STATUSES.DELIVERED,
    ORDER_STATUSES.CANCELLED,
  ],
  [ORDER_STATUSES.SHIPPED]: [ORDER_STATUSES.DELIVERED],
  [ORDER_STATUSES.DELIVERED]: [ORDER_STATUSES.CONFIRMED],
  [ORDER_STATUSES.CONFIRMED]: [],
  [ORDER_STATUSES.CANCELLED]: [],
};

/**
 * 주문 상태전이 가능 여부 검증
 */
export function canTransitionOrder(
  from: OrderStatus | string,
  to: OrderStatus | string
): StateTransitionResult {
  // 타입 검증
  if (!isValidOrderStatus(from)) {
    return {
      valid: false,
      error: new StateTransitionError(
        'INVALID_STATUS',
        `유효하지 않은 주문 상태: ${from}`,
        from,
        to
      ),
    };
  }

  if (!isValidOrderStatus(to)) {
    return {
      valid: false,
      error: new StateTransitionError(
        'INVALID_STATUS',
        `유효하지 않은 주문 상태: ${to}`,
        from,
        to
      ),
    };
  }

  // 동일 상태는 허용하지 않음
  if (from === to) {
    return {
      valid: false,
      error: new StateTransitionError(
        'SAME_STATUS',
        `동일한 상태로 전이할 수 없습니다: ${from}`,
        from,
        to
      ),
    };
  }

  // 전이 가능 여부 확인
  const allowedTransitions = ORDER_TRANSITION_MAP[from];
  if (!allowedTransitions.includes(to)) {
    return {
      valid: false,
      error: new StateTransitionError(
        'INVALID_TRANSITION',
        `주문 상태 전이가 허용되지 않습니다: ${from} → ${to}`,
        from,
        to,
        { allowedTransitions }
      ),
    };
  }

  return { valid: true };
}

/**
 * 주문 상태전이 검증 및 에러 반환 (API 핸들러용)
 */
export function validateOrderTransition(
  from: OrderStatus | string,
  to: OrderStatus | string
): void {
  const result = canTransitionOrder(from, to);
  if (!result.valid && result.error) {
    // HTTP 409 Conflict로 반환 가능하도록 에러 던지기
    throw result.error;
  }
}

// ============================================================
// 현장수령 스케줄 상태전이 규칙
// ============================================================
/**
 * 스케줄 상태전이 허용 규칙 (표)
 * 
 * from \ to    | pending | reserved | completed | no_show | canceled
 * -------------|---------|----------|-----------|---------|----------
 * pending      |    -    |    ✅    |     ❌     |    ❌    |    ✅
 * reserved     |    ❌   |    -     |     ✅     |    ✅    |    ✅
 * completed    |    ❌   |    ❌    |     -      |    ❌    |    ❌
 * no_show      |    ❌   |    ❌    |     ❌     |    -     |    ❌
 * canceled     |    ❌   |    ❌    |     ❌     |    ❌    |    -
 * 
 * 규칙:
 * - pending → reserved: 파트너가 스케줄 확정 (start_at/location_id 입력)
 * - pending → canceled: 파트너/사용자 취소
 * - reserved → completed: 파트너가 수령 완료 처리 (timesheet=IN 조건, 근무형 파트너만)
 * - reserved → no_show: 사용자가 미수령 신고 (조건: now >= start_at + GRACE_MINUTES)
 * - reserved → canceled: 파트너/사용자 취소
 * - completed, no_show, canceled: 종료 상태 (추가 전이 불가)
 */
const SCHEDULE_TRANSITION_MAP: Record<ScheduleStatus, ScheduleStatus[]> = {
  [SCHEDULE_STATUSES.PENDING]: [SCHEDULE_STATUSES.RESERVED, SCHEDULE_STATUSES.CANCELED],
  [SCHEDULE_STATUSES.RESERVED]: [
    SCHEDULE_STATUSES.COMPLETED,
    SCHEDULE_STATUSES.NO_SHOW,
    SCHEDULE_STATUSES.CANCELED,
  ],
  [SCHEDULE_STATUSES.COMPLETED]: [],
  [SCHEDULE_STATUSES.NO_SHOW]: [],
  [SCHEDULE_STATUSES.CANCELED]: [],
};

/**
 * 스케줄 상태전이 가능 여부 검증
 */
export function canTransitionSchedule(
  from: ScheduleStatus | string,
  to: ScheduleStatus | string
): StateTransitionResult {
  // 타입 검증
  if (!isValidScheduleStatus(from)) {
    return {
      valid: false,
      error: new StateTransitionError(
        'INVALID_STATUS',
        `유효하지 않은 스케줄 상태: ${from}`,
        from,
        to
      ),
    };
  }

  if (!isValidScheduleStatus(to)) {
    return {
      valid: false,
      error: new StateTransitionError(
        'INVALID_STATUS',
        `유효하지 않은 스케줄 상태: ${to}`,
        from,
        to
      ),
    };
  }

  // 동일 상태는 허용하지 않음
  if (from === to) {
    return {
      valid: false,
      error: new StateTransitionError(
        'SAME_STATUS',
        `동일한 상태로 전이할 수 없습니다: ${from}`,
        from,
        to
      ),
    };
  }

  // 전이 가능 여부 확인
  const allowedTransitions = SCHEDULE_TRANSITION_MAP[from];
  if (!allowedTransitions.includes(to)) {
    return {
      valid: false,
      error: new StateTransitionError(
        'INVALID_TRANSITION',
        `스케줄 상태 전이가 허용되지 않습니다: ${from} → ${to}`,
        from,
        to,
        { allowedTransitions }
      ),
    };
  }

  return { valid: true };
}

/**
 * 스케줄 상태전이 검증 및 에러 반환 (API 핸들러용)
 */
export function validateScheduleTransition(
  from: ScheduleStatus | string,
  to: ScheduleStatus | string
): void {
  const result = canTransitionSchedule(from, to);
  if (!result.valid && result.error) {
    throw result.error;
  }
}

// ============================================================
// no_show 조건 검증 (현장수령)
// ============================================================
/**
 * no_show 신고 가능 여부 검증
 * 조건: 현재 시간 >= start_at + GRACE_MINUTES (기본 30분)
 */
export interface NoShowValidationOptions {
  startAt: string | Date;
  graceMinutes?: number; // 기본 30분
}

export function canReportNoShow(options: NoShowValidationOptions): StateTransitionResult {
  const { startAt, graceMinutes = 30 } = options;
  const startTime = typeof startAt === 'string' ? new Date(startAt) : startAt;
  const now = new Date();

  if (isNaN(startTime.getTime())) {
    return {
      valid: false,
      error: new StateTransitionError(
        'INVALID_DATE',
        `유효하지 않은 시작 시간: ${startAt}`,
        SCHEDULE_STATUSES.RESERVED,
        SCHEDULE_STATUSES.NO_SHOW
      ),
    };
  }

  const graceTime = new Date(startTime.getTime() + graceMinutes * 60 * 1000);

  if (now < graceTime) {
    return {
      valid: false,
      error: new StateTransitionError(
        'NO_SHOW_TOO_EARLY',
        `no_show 신고는 예약 시간 ${graceMinutes}분 후부터 가능합니다. (예약: ${startTime.toISOString()}, 현재: ${now.toISOString()})`,
        SCHEDULE_STATUSES.RESERVED,
        SCHEDULE_STATUSES.NO_SHOW,
        {
          startAt: startTime.toISOString(),
          now: now.toISOString(),
          graceMinutes,
          graceTime: graceTime.toISOString(),
        }
      ),
    };
  }

  return { valid: true };
}

// ============================================================
// 상태전이 에러를 HTTP 응답으로 변환
// ============================================================
export function stateTransitionErrorToResponse(error: StateTransitionError): Response {
  const statusCode = error.code === 'INVALID_STATUS' ? 400 : 409; // Conflict
  return new Response(
    JSON.stringify({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: {
          from: error.fromStatus,
          to: error.toStatus,
          ...error.details,
        },
      },
    }),
    {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}




