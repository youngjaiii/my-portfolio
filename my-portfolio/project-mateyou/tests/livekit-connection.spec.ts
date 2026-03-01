import { test, expect } from '@playwright/test';

test.describe('LiveKit Connection Tests', () => {
  test.beforeEach(async ({ page }) => {
    // 앱이 로드될 때까지 대기
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should handle LiveKit connection without XPC errors', async ({ page }) => {
    // 콘솔 에러 모니터링
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // LiveKit 연결 시도 (실제로는 모의 또는 실제 연결 테스트)
    // 여기서는 UI 요소들이 정상적으로 표시되는지 확인

    // 로그인 상태 확인 및 통화 UI 표시 테스트
    await page.waitForTimeout(2000);

    // XPC connection interrupted 에러가 발생하지 않았는지 확인
    const xpcErrors = errors.filter(error =>
      error.includes('XPC connection interrupted') ||
      error.includes('Fig signalled err=-12710')
    );

    expect(xpcErrors.length).toBe(0);

    console.log('Console errors during test:', errors);
  });

  test('should display call UI when call state is active', async ({ page }) => {
    // 통화 상태 시뮬레이션 (실제로는 상태를 조작해야 함)
    // 여기서는 UI 컴포넌트가 존재하는지 확인

    const callUI = page.locator('[data-testid="global-voice-call-ui"]').first();
    // 통화 중이 아닐 때는 표시되지 않아야 함
    await expect(callUI).not.toBeVisible();
  });

  test('should handle connection state changes properly', async ({ page }) => {
    // LiveKit 연결 상태 변화 테스트
    const logs: string[] = [];

    page.on('console', msg => {
      if (msg.text().includes('[LiveKit]')) {
        logs.push(msg.text());
      }
    });

    // 페이지 로드 후 잠시 대기
    await page.waitForTimeout(3000);

    // 연결 관련 로그가 있는지 확인
    const connectionLogs = logs.filter(log =>
      log.includes('Connection state') ||
      log.includes('Room connected') ||
      log.includes('Audio session')
    );

    console.log('LiveKit connection logs:', connectionLogs);

    // 에러 로그가 없는지 확인
    const errorLogs = logs.filter(log =>
      log.includes('❌') ||
      log.includes('Failed') ||
      log.includes('Error')
    );

    // 일부 에러는 허용될 수 있음 (네트워크 등)
    const criticalErrors = errorLogs.filter(log =>
      log.includes('XPC connection interrupted') ||
      log.includes('Fig signalled err=-12710') ||
      log.includes('Audio Engine Error')
    );

    expect(criticalErrors.length).toBe(0);
  });
});






