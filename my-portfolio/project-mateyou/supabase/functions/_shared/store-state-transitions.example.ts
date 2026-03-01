/**
 * Store 상태전이 규칙 사용 예시
 * API 핸들러에서 상태전이 검증을 적용하는 방법
 */

import {
  validateOrderTransition,
  validateScheduleTransition,
  canReportNoShow,
  stateTransitionErrorToResponse,
  ORDER_STATUSES,
  SCHEDULE_STATUSES,
} from './store-state-transitions.ts';
import { errorResponse } from './utils.ts';

// ============================================================
// 예시 1: 주문 상태 변경 API 핸들러
// ============================================================
export async function exampleUpdateOrderStatus(
  orderId: string,
  currentStatus: string,
  newStatus: string
) {
  try {
    // 상태전이 검증
    validateOrderTransition(currentStatus, newStatus);

    // 검증 통과 시 DB 업데이트
    // const { data, error } = await supabase
    //   .from('store_orders')
    //   .update({ status: newStatus })
    //   .eq('order_id', orderId);

    return { success: true };
  } catch (error) {
    // StateTransitionError를 HTTP 응답으로 변환
    if (error instanceof Error && error.name === 'StateTransitionError') {
      return stateTransitionErrorToResponse(error);
    }
    // 기타 에러는 일반 에러 응답
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

// ============================================================
// 예시 2: 스케줄 상태 변경 API 핸들러
// ============================================================
export async function exampleUpdateScheduleStatus(
  scheduleId: string,
  currentStatus: string,
  newStatus: string
) {
  try {
    // 상태전이 검증
    validateScheduleTransition(currentStatus, newStatus);

    // no_show 전이인 경우 추가 조건 검증
    if (newStatus === SCHEDULE_STATUSES.NO_SHOW) {
      // start_at 조회 필요
      // const { data: schedule } = await supabase
      //   .from('store_partner_schedules')
      //   .select('start_time')
      //   .eq('schedule_id', scheduleId)
      //   .single();

      // const noShowResult = canReportNoShow({
      //   startAt: schedule.start_time,
      //   graceMinutes: 30,
      // });

      // if (!noShowResult.valid) {
      //   return stateTransitionErrorToResponse(noShowResult.error!);
      // }
    }

    // 검증 통과 시 DB 업데이트
    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.name === 'StateTransitionError') {
      return stateTransitionErrorToResponse(error);
    }
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

// ============================================================
// 예시 3: canTransitionOrder를 사용한 조건부 로직
// ============================================================
export function exampleCheckOrderTransition(currentStatus: string, targetStatus: string) {
  const result = validateOrderTransition(currentStatus, targetStatus);

  if (!result.valid) {
    // 전이가 불가능한 경우 처리
    console.log(`전이 불가: ${result.error?.message}`);
    return false;
  }

  // 전이가 가능한 경우 처리
  return true;
}

// ============================================================
// 예시 4: no_show 신고 API 핸들러
// ============================================================
export async function exampleReportNoShow(scheduleId: string) {
  // 스케줄 정보 조회
  // const { data: schedule } = await supabase
  //   .from('store_partner_schedules')
  //   .select('start_time, status')
  //   .eq('schedule_id', scheduleId)
  //   .single();

  // if (schedule.status !== SCHEDULE_STATUSES.RESERVED) {
  //   return errorResponse('INVALID_STATUS', 'reserved 상태에서만 no_show 신고가 가능합니다.');
  // }

  // no_show 조건 검증
  // const noShowResult = canReportNoShow({
  //   startAt: schedule.start_time,
  //   graceMinutes: 30, // PRD 기준 30분
  // });

  // if (!noShowResult.valid) {
  //   return stateTransitionErrorToResponse(noShowResult.error!);
  // }

  // 상태전이 검증
  // validateScheduleTransition(schedule.status, SCHEDULE_STATUSES.NO_SHOW);

  // DB 업데이트 및 환불 처리
  return { success: true };
}




