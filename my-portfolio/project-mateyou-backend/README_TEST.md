# 테스트 가이드

## 설치

테스트를 실행하기 전에 필요한 의존성을 설치하세요:

```bash
npm install
```

## 테스트 실행

### 모든 테스트 실행
```bash
npm test
```

### Watch 모드로 테스트 실행 (파일 변경 시 자동 재실행)
```bash
npm run test:watch
```

### 커버리지 리포트 생성
```bash
npm run test:coverage
```

## 테스트 구조

테스트 파일은 `src/routes/__tests__/` 디렉토리에 위치합니다.

### 파트너 삭제 기능 테스트

`admin.route.test.ts` 파일은 다음 시나리오를 테스트합니다:

1. **파트너가 존재하지 않는 경우**
   - member role을 normal로 변경하는지 확인

2. **파트너가 존재하는 경우**
   - 토스 셀러 삭제
   - partner_withdrawals 삭제
   - partner_requests 상태 변경 (pending/in_progress → rejected)
   - 채팅 메시지 전송
   - 채팅방 생성 (없는 경우)
   - partners 테이블에서 파트너 삭제
   - member role을 normal로 변경

3. **에러 처리**
   - memberId가 없는 경우
   - 파트너 조회 중 에러 발생
   - 토스 셀러 삭제 실패 시에도 계속 진행
   - 토스 시크릿 키가 없는 경우에도 계속 진행

## TDD 워크플로우

1. **Red**: 테스트를 작성하고 실패하는지 확인
2. **Green**: 최소한의 코드로 테스트를 통과시키기
3. **Refactor**: 코드를 개선하면서 테스트가 계속 통과하는지 확인

## 모킹

테스트에서는 다음을 모킹합니다:
- Supabase 클라이언트
- Toss Payments API 호출
- 인증 미들웨어
- 유틸리티 함수

## 주의사항

- 테스트는 실제 데이터베이스나 외부 API를 호출하지 않습니다
- 모든 외부 의존성은 모킹됩니다
- 테스트 간 격리를 위해 `beforeEach`에서 모든 모크를 초기화합니다

