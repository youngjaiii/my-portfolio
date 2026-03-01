/**
 * Store 상태전이 규칙 단위 테스트 (검증 스니펫)
 * Deno 환경에서 실행 가능한 테스트 예시
 */

import {
  canTransitionOrder,
  canTransitionSchedule,
  canReportNoShow,
  ORDER_STATUSES,
  SCHEDULE_STATUSES,
} from './store-state-transitions.ts';

// ============================================================
// 주문 상태전이 테스트
// ============================================================
function testOrderTransitions() {
  console.log('=== 주문 상태전이 테스트 ===\n');

  // ✅ 허용되는 전이
  const validTransitions = [
    { from: ORDER_STATUSES.PENDING, to: ORDER_STATUSES.PAID },
    { from: ORDER_STATUSES.PENDING, to: ORDER_STATUSES.CANCELLED },
    { from: ORDER_STATUSES.PAID, to: ORDER_STATUSES.SHIPPED },
    { from: ORDER_STATUSES.PAID, to: ORDER_STATUSES.DELIVERED },
    { from: ORDER_STATUSES.PAID, to: ORDER_STATUSES.CANCELLED },
    { from: ORDER_STATUSES.SHIPPED, to: ORDER_STATUSES.DELIVERED },
    { from: ORDER_STATUSES.DELIVERED, to: ORDER_STATUSES.CONFIRMED },
  ];

  validTransitions.forEach(({ from, to }) => {
    const result = canTransitionOrder(from, to);
    console.log(`✅ ${from} → ${to}: ${result.valid ? 'PASS' : 'FAIL'}`);
    if (!result.valid) {
      console.log(`   에러: ${result.error?.message}`);
    }
  });

  // ❌ 허용되지 않는 전이
  const invalidTransitions = [
    { from: ORDER_STATUSES.PENDING, to: ORDER_STATUSES.SHIPPED },
    { from: ORDER_STATUSES.PAID, to: ORDER_STATUSES.CONFIRMED },
    { from: ORDER_STATUSES.SHIPPED, to: ORDER_STATUSES.CANCELLED },
    { from: ORDER_STATUSES.DELIVERED, to: ORDER_STATUSES.CANCELLED },
    { from: ORDER_STATUSES.CONFIRMED, to: ORDER_STATUSES.CANCELLED },
    { from: ORDER_STATUSES.CANCELLED, to: ORDER_STATUSES.PAID },
  ];

  console.log('\n--- 허용되지 않는 전이 ---');
  invalidTransitions.forEach(({ from, to }) => {
    const result = canTransitionOrder(from, to);
    console.log(`❌ ${from} → ${to}: ${result.valid ? 'FAIL (허용되면 안됨)' : 'PASS'}`);
    if (result.valid) {
      console.log(`   경고: 허용되지 않아야 하는 전이가 허용됨`);
    }
  });

  // 동일 상태 전이 시도
  console.log('\n--- 동일 상태 전이 시도 ---');
  const sameStatus = canTransitionOrder(ORDER_STATUSES.PAID, ORDER_STATUSES.PAID);
  console.log(`❌ ${ORDER_STATUSES.PAID} → ${ORDER_STATUSES.PAID}: ${sameStatus.valid ? 'FAIL' : 'PASS'}`);
}

// ============================================================
// 스케줄 상태전이 테스트
// ============================================================
function testScheduleTransitions() {
  console.log('\n=== 스케줄 상태전이 테스트 ===\n');

  // ✅ 허용되는 전이
  const validTransitions = [
    { from: SCHEDULE_STATUSES.PENDING, to: SCHEDULE_STATUSES.RESERVED },
    { from: SCHEDULE_STATUSES.PENDING, to: SCHEDULE_STATUSES.CANCELED },
    { from: SCHEDULE_STATUSES.RESERVED, to: SCHEDULE_STATUSES.COMPLETED },
    { from: SCHEDULE_STATUSES.RESERVED, to: SCHEDULE_STATUSES.NO_SHOW },
    { from: SCHEDULE_STATUSES.RESERVED, to: SCHEDULE_STATUSES.CANCELED },
  ];

  validTransitions.forEach(({ from, to }) => {
    const result = canTransitionSchedule(from, to);
    console.log(`✅ ${from} → ${to}: ${result.valid ? 'PASS' : 'FAIL'}`);
    if (!result.valid) {
      console.log(`   에러: ${result.error?.message}`);
    }
  });

  // ❌ 허용되지 않는 전이
  const invalidTransitions = [
    { from: SCHEDULE_STATUSES.PENDING, to: SCHEDULE_STATUSES.COMPLETED },
    { from: SCHEDULE_STATUSES.RESERVED, to: SCHEDULE_STATUSES.PENDING },
    { from: SCHEDULE_STATUSES.COMPLETED, to: SCHEDULE_STATUSES.RESERVED },
    { from: SCHEDULE_STATUSES.NO_SHOW, to: SCHEDULE_STATUSES.COMPLETED },
    { from: SCHEDULE_STATUSES.CANCELED, to: SCHEDULE_STATUSES.RESERVED },
  ];

  console.log('\n--- 허용되지 않는 전이 ---');
  invalidTransitions.forEach(({ from, to }) => {
    const result = canTransitionSchedule(from, to);
    console.log(`❌ ${from} → ${to}: ${result.valid ? 'FAIL (허용되면 안됨)' : 'PASS'}`);
  });
}

// ============================================================
// no_show 조건 테스트
// ============================================================
function testNoShowValidation() {
  console.log('\n=== no_show 조건 검증 테스트 ===\n');

  const now = new Date();
  const past30Min = new Date(now.getTime() - 31 * 60 * 1000); // 31분 전
  const past10Min = new Date(now.getTime() - 10 * 60 * 1000); // 10분 전
  const future10Min = new Date(now.getTime() + 10 * 60 * 1000); // 10분 후

  // ✅ 30분 경과 후 신고 가능
  const result1 = canReportNoShow({ startAt: past30Min });
  console.log(`✅ 31분 전 예약: ${result1.valid ? 'PASS' : 'FAIL'}`);
  if (!result1.valid) {
    console.log(`   에러: ${result1.error?.message}`);
  }

  // ❌ 10분 경과 후 신고 불가 (30분 미만)
  const result2 = canReportNoShow({ startAt: past10Min });
  console.log(`❌ 10분 전 예약: ${result2.valid ? 'FAIL (신고되면 안됨)' : 'PASS'}`);
  if (result2.valid) {
    console.log(`   경고: 30분 미만인데 신고 가능함`);
  } else {
    console.log(`   메시지: ${result2.error?.message}`);
  }

  // ❌ 미래 예약 신고 불가
  const result3 = canReportNoShow({ startAt: future10Min });
  console.log(`❌ 미래 예약: ${result3.valid ? 'FAIL (신고되면 안됨)' : 'PASS'}`);
  if (result3.valid) {
    console.log(`   경고: 미래 예약인데 신고 가능함`);
  }

  // 커스텀 graceMinutes 테스트
  const result4 = canReportNoShow({ startAt: past10Min, graceMinutes: 5 });
  console.log(`✅ 10분 전 예약 (5분 grace): ${result4.valid ? 'PASS' : 'FAIL'}`);
}

// ============================================================
// 실행
// ============================================================
if (import.meta.main) {
  testOrderTransitions();
  testScheduleTransitions();
  testNoShowValidation();
  console.log('\n=== 테스트 완료 ===');
}




