# 🔔 자동 푸시 알림 시스템

## 개요

Database Trigger를 사용하여 특정 테이블에 데이터가 추가/업데이트될 때 자동으로 푸시 알림을 전송하는 시스템입니다.

## 아키텍처

```
Database Table (member_chats, partner_requests 등)
    ↓
Database Trigger (notify_push_to_target)
    ↓
pg_net HTTP Request
    ↓
Edge Function (push-notification-auto)
    ↓
web_push_subscriptions 테이블 조회 (target_id 기준)
    ↓
Web Push API
    ↓
사용자 브라우저
```

## 테이블 구조

### web_push_subscriptions

```sql
CREATE TABLE public.web_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NULL,
  target_id text NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text NULL,
  created_at timestamp with time zone DEFAULT now(),
  last_used_at timestamp with time zone NULL,
  
  CONSTRAINT web_push_subscriptions_owner_chk CHECK (
    ((member_id IS NOT NULL)::integer + ((target_id IS NOT NULL)::integer)) = 1
  )
);
```

- `member_id`: 구독한 member의 ID (UUID)
- `target_id`: 특정 대상의 ID (TEXT) - 예: 특정 파트너 ID, 채팅방 ID 등
- 둘 중 하나만 설정 가능 (CHECK 제약조건)

## 설정 방법

### 1. Database Migration 실행

```bash
supabase migration up
```

또는 Supabase Dashboard에서 SQL Editor를 통해 실행:

```sql
-- supabase/migrations/20250115000000_create_push_trigger.sql 파일의 내용 실행
```

### 2. Supabase URL과 Anon Key 설정

Database Trigger 함수에서 Supabase URL과 Anon Key를 사용하므로 설정이 필요합니다.

**옵션 1: PostgreSQL 설정 사용**

```sql
ALTER DATABASE postgres SET app.supabase_url = 'https://your-project.supabase.co';
ALTER DATABASE postgres SET app.supabase_anon_key = 'your-anon-key';
```

**옵션 2: 함수 내부에 직접 설정**

`notify_push_to_target()` 함수의 66-67번 라인을 수정:

```sql
v_supabase_url := 'https://your-project.supabase.co';
v_supabase_anon_key := 'your-anon-key';
```

### 3. Edge Function 배포

```bash
supabase functions deploy push-notification-auto
```

### 4. VAPID 키 설정

Edge Function의 환경 변수에 VAPID 키를 설정해야 합니다:

```bash
supabase secrets set VAPID_PUBLIC_KEY=your-vapid-public-key
supabase secrets set VAPID_PRIVATE_KEY=your-vapid-private-key
supabase secrets set VAPID_EMAIL=noreply@mateyou.me
```

### 5. 프런트엔드 환경변수 설정 (.env.local)

```bash
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Web Push
VITE_VAPID_PUBLIC_KEY=your-vapid-public-key
```

### 6. 클라이언트 구독 흐름 (로그인 사용자에 한정)
- 앱 루트에서 로그인+권한 허용 시 `registerPushSubscription()` 호출
- 서비스 워커 `sw.js` 등록 → `PushManager.subscribe` → `web_push_subscriptions` 저장
- 저장 API: Edge Function `push-notification`의 `save_subscription` 액션 사용

```ts
// src/lib/edgeApi.ts
edgeApi.pushNotification.saveSubscription({
  member_id: user.role === 'partner' ? null : user.id,
  partner_id: user.role === 'partner' ? partnerId /* 조회값 또는 null */ : null,
  endpoint: subscription.endpoint,
  p256dh: keys.p256dh,
  auth: keys.auth,
  user_agent: navigator.userAgent,
})
```

파트너의 경우 `partner_id`로 저장 요청하면 Edge Function에서 `target_id`로 매핑되어 저장됩니다.

## 동작 방식

### 1. member_chats 테이블

- **트리거**: `trg_notify_push_on_message`
- **조건**: `AFTER INSERT ON member_chats WHERE is_read = false`
- **target_id**: `receiver_id` (메시지를 받는 사용자)
- **알림 내용**: "새로운 메시지" + 메시지 내용 (최대 100자)

### 2. partner_requests 테이블

- **트리거**: `trg_notify_push_on_request`
- **조건**: `AFTER INSERT ON partner_requests WHERE status = 'pending'`
- **target_id**: `partners.member_id` (파트너의 member_id)
- **알림 내용**: "새로운 의뢰 요청" + 의뢰 타입 + 건수

## 구독 등록

클라이언트에서 `push-notification` Edge Function을 통해 구독을 등록합니다:

```typescript
// member_id로 구독 등록
await edgeApi.pushNotification.saveSubscription({
  member_id: user.id,
  endpoint: subscription.endpoint,
  p256dh: subscription.keys.p256dh,
  auth: subscription.keys.auth,
  user_agent: navigator.userAgent,
})

// 파트너의 경우 partner_id를 전달하면 서버에서 target_id로 저장 처리
await edgeApi.pushNotification.saveSubscription({
  member_id: null,
  partner_id: partnerId,
  endpoint: subscription.endpoint,
  p256dh: subscription.keys.p256dh,
  auth: subscription.keys.auth,
  user_agent: navigator.userAgent,
})
```

## 문제 해결

### Trigger가 작동하지 않는 경우

1. **pg_net 확장이 활성화되었는지 확인**:
```sql
SELECT * FROM pg_extension WHERE extname = 'pg_net';
```

2. **Supabase URL과 Anon Key가 설정되었는지 확인**:
```sql
SELECT current_setting('app.supabase_url', true);
SELECT current_setting('app.supabase_anon_key', true);
```

3. **Trigger가 생성되었는지 확인**:
```sql
SELECT * FROM pg_trigger WHERE tgname LIKE 'trg_notify_push%';
```

### Edge Function이 호출되지 않는 경우

1. **Edge Function이 배포되었는지 확인**:
```bash
supabase functions list
```

2. **로그 확인**:
```bash
supabase functions logs push-notification-auto
```

### 푸시 알림이 전송되지 않는 경우

1. **web_push_subscriptions에 구독 정보가 있는지 확인**:
```sql
SELECT * FROM web_push_subscriptions WHERE target_id = 'your-target-id';
```

2. **VAPID 키가 설정되었는지 확인**:
```bash
supabase secrets list
```

3. **브라우저 콘솔에서 Service Worker 등록 확인**

4. **로컬 개발 테스트 (DevMode)**
   - 데스크톱 로컬에서 `DEV MODE` > `푸시 테스트 보내기` 버튼 클릭
   - 현재 로그인 사용자 `id`를 `target_id`로 `push-notification-auto`에 전송
   - 알림이 오지 않으면 `web_push_subscriptions`에 레코드 유무, 콘솔 에러, VAPID 설정을 확인

5. **Safari 지원**
   - macOS Safari는 최신 버전에서 Web Push를 지원합니다. 구형 버전은 `PushManager`가 없으므로 푸시가 비활성화됩니다.

## 주의사항

1. **비동기 실행**: Database Trigger에서 Edge Function을 호출하는 것은 비동기적으로 실행됩니다. 에러가 발생해도 원본 트랜잭션은 롤백되지 않습니다.

2. **성능**: Trigger 함수는 빠르게 실행되어야 합니다. 무거운 작업은 Edge Function에서 처리합니다.

3. **에러 처리**: Trigger 함수에서 에러가 발생하면 경고만 출력하고 원본 트랜잭션은 계속 진행됩니다.

4. **보안**: Supabase Anon Key를 사용하므로 RLS 정책이 제대로 설정되어 있어야 합니다.

