# 푸시 알림 큐 시스템 가이드

이 문서는 푸시 알림 큐 시스템의 사용 방법을 설명합니다.

## 📋 개요

푸시 알림 큐 시스템은 `web_push_subscriptions` 테이블을 사용하여 푸시 알림을 관리하고, 큐에 쌓인 알림을 백그라운드 워커가 주기적으로 처리합니다.

## 🗄️ 데이터베이스 구조

### push_notifications_queue 테이블

푸시 알림이 큐에 저장되는 테이블입니다.

```sql
CREATE TABLE push_notifications_queue (
  id UUID PRIMARY KEY,
  user_id UUID,                    -- 발신자 ID
  target_member_id UUID,           -- 대상 멤버 ID
  target_partner_id TEXT,          -- 대상 파트너 ID (target_id)
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  icon TEXT,
  url TEXT,
  tag TEXT,
  notification_type TEXT DEFAULT 'system',
  data JSONB,
  status TEXT DEFAULT 'pending',   -- pending, processing, sent, failed
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### web_push_subscriptions 테이블

웹 푸시 구독 정보를 저장하는 테이블입니다.

- `member_id`: 일반 멤버의 경우
- `target_id`: 파트너의 경우 (partners.id를 TEXT로 저장)
- `endpoint`, `p256dh`, `auth`: Web Push 구독 정보

## 🚀 사용 방법

### 1. 푸시 구독 저장

```typescript
POST /api/push/subscribe
Authorization: Bearer <token>

{
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": {
    "p256dh": "...",
    "auth": "..."
  }
}
```

### 2. 푸시 알림을 큐에 추가

```typescript
POST /api/push/queue
Authorization: Bearer <token>

{
  "target_member_id": "user-uuid",  // 또는 target_partner_id
  "title": "새로운 메시지",
  "body": "안녕하세요!",
  "icon": "/icon.png",
  "url": "/chat",
  "tag": "message",
  "notification_type": "message",
  "data": {
    "room_id": "room-123"
  },
  "scheduled_at": "2025-01-16T10:00:00Z"  // 선택적: 예약 전송
}
```

### 3. 큐 처리 (워커)

백그라운드 워커가 자동으로 실행되지만, 수동으로도 호출 가능합니다:

```typescript
POST /api/push/process
Authorization: Bearer <token>

{
  "batchSize": 50  // 선택적
}
```

### 4. 큐 상태 조회

```typescript
GET /api/push/queue/status?status=pending&limit=50
Authorization: Bearer <token>
```

### 5. 즉시 전송 (큐 사용 안 함)

```typescript
POST /api/push/send
Authorization: Bearer <token>

{
  "target_member_id": "user-uuid",
  "title": "긴급 알림",
  "body": "즉시 전송",
  "icon": "/icon.png",
  "url": "/",
  "tag": "urgent"
}
```

## ⚙️ 백그라운드 워커

서버가 시작되면 자동으로 백그라운드 워커가 실행됩니다:

- **기본 실행 주기**: 30초마다
- **환경변수로 설정**: `PUSH_QUEUE_INTERVAL=30000` (밀리초)
- **워커 비활성화**: `ENABLE_PUSH_QUEUE_WORKER=false`

### 워커 동작 방식

1. `push_notifications_queue` 테이블에서 `status='pending'`인 항목 조회
2. `scheduled_at`이 현재 시간 이하인 항목만 처리
3. `web_push_subscriptions`에서 구독 정보 조회
4. 각 구독에 대해 푸시 알림 전송
5. 성공/실패에 따라 상태 업데이트
6. 실패 시 재시도 (최대 3회)

## 🔧 환경 변수 설정

```env
# VAPID 키 (필수)
VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
VAPID_SUBJECT=mailto:noreply@mateyou.com

# 워커 설정 (선택적)
PUSH_QUEUE_INTERVAL=30000  # 30초 (밀리초)
ENABLE_PUSH_QUEUE_WORKER=true  # false로 설정하면 워커 비활성화
```

## 📊 큐 상태

- **pending**: 대기 중
- **processing**: 처리 중
- **sent**: 전송 완료
- **failed**: 전송 실패 (재시도 횟수 초과)

## 🔄 재시도 로직

- 기본 최대 재시도 횟수: 3회
- 실패한 알림은 `retry_count`가 증가
- `retry_count < max_retries`이면 다시 `pending` 상태로 변경
- `retry_count >= max_retries`이면 `failed` 상태로 변경

## 💡 사용 예시

### 메시지 알림 큐에 추가

```typescript
// 채팅 메시지 전송 시
await fetch('http://localhost:4000/api/push/queue', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    target_member_id: receiverId,
    title: senderName,
    body: message,
    notification_type: 'message',
    url: `/chat?room_id=${roomId}`,
    tag: `chat-${roomId}`,
    data: {
      room_id: roomId,
      sender_id: senderId
    }
  })
});
```

### 의뢰 알림 큐에 추가

```typescript
// 파트너 의뢰 생성 시
await fetch('http://localhost:4000/api/push/queue', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    target_partner_id: partnerId,  // 파트너의 partners.id
    title: '새로운 의뢰 요청!',
    body: `${clientName}님이 ${jobName} ${jobCount}회 의뢰를 요청했습니다.`,
    notification_type: 'request',
    url: '/partner/dashboard?tab=requests',
    tag: `new-request-${requestId}`,
    data: {
      request_id: requestId,
      client_name: clientName,
      job_name: jobName
    }
  })
});
```

## 🎯 알림 타입

- `message`: 메시지 알림
- `request`: 의뢰 알림
- `payment`: 결제 알림
- `system`: 시스템 알림
- `call`: 통화 알림
- `review`: 리뷰 알림

## ⚠️ 주의사항

1. **VAPID 키 설정**: 반드시 환경변수에 VAPID 키를 설정해야 합니다.
2. **구독 정보**: `web_push_subscriptions` 테이블에 구독 정보가 있어야 푸시 전송이 가능합니다.
3. **재시도**: 실패한 알림은 자동으로 재시도되지만, 최대 재시도 횟수를 초과하면 `failed` 상태가 됩니다.
4. **워커 성능**: 대량의 푸시 알림이 있는 경우 `batchSize`를 조정하여 처리 속도를 조절할 수 있습니다.

## 🔍 모니터링

큐 상태를 모니터링하려면:

```typescript
GET /api/push/queue/status?status=pending
```

이를 통해 대기 중인 알림 수를 확인할 수 있습니다.

## 🐛 문제 해결

### 푸시가 전송되지 않는 경우

1. **구독 정보 확인**: `web_push_subscriptions` 테이블에 구독 정보가 있는지 확인
2. **큐 상태 확인**: `/api/push/queue/status`로 큐 상태 확인
3. **VAPID 키 확인**: 환경변수에 VAPID 키가 올바르게 설정되었는지 확인
4. **에러 로그 확인**: 서버 로그에서 에러 메시지 확인

### 워커가 실행되지 않는 경우

1. `ENABLE_PUSH_QUEUE_WORKER` 환경변수가 `false`로 설정되지 않았는지 확인
2. 서버 로그에서 워커 시작 메시지 확인: `📬 Push queue worker started`

