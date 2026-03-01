# Push 알림 시스템 완벽 가이드

MateYou 프로젝트의 Web Push Notification 시스템 통합 가이드입니다.

## 📚 목차

1. [시스템 개요](#-시스템-개요)
2. [VAPID란?](#-vapid란)
3. [아키텍처](#-아키텍처)
4. [백엔드 설정](#-백엔드-설정)
5. [프론트엔드 구현](#-프론트엔드-구현)
6. [테스트 방법](#-테스트-방법)
7. [트러블슈팅](#-트러블슈팅)
8. [FAQ](#-faq)

---

## 📋 시스템 개요

MateYou의 Push 알림 시스템은 **Web Push Protocol**을 사용하여 브라우저에 실시간 알림을 전송합니다.

### 주요 특징

- ✅ **큐 기반 처리**: 안정적인 대량 알림 처리
- ✅ **자동 재시도**: 실패한 알림 자동 재전송 (최대 3회)
- ✅ **만료 구독 자동 정리**: 410/404 에러 시 자동 삭제
- ✅ **배치 처리**: 5초마다 최대 50개씩 처리
- ✅ **VAPID 인증**: 표준 웹 푸시 프로토콜 준수

### 지원 브라우저

| 브라우저 | 지원 버전 | Push Service |
|---------|---------|--------------|
| Chrome | 42+ | FCM (Firebase Cloud Messaging) |
| Edge | 17+ | FCM |
| Firefox | 44+ | Mozilla Push Service |
| Safari | 16+ (macOS 13+) | APNs |
| Opera | 29+ | FCM |

---

## 🔐 VAPID란?

**VAPID** (Voluntary Application Server Identification)는 웹 푸시 알림에서 서버의 신원을 확인하는 프로토콜입니다.

### 왜 필요한가요?

1. **서버 인증**: Push Service(FCM, APNs 등)에 "누가" 알림을 보내는지 증명
2. **스팸 방지**: 인증된 서버만 알림을 보낼 수 있음
3. **보안 강화**: 공개키/개인키 쌍으로 암호화된 통신
4. **브라우저 표준**: Chrome, Firefox, Safari 등 모든 최신 브라우저가 요구

### 동작 원리

```
┌─────────────────┐                    ┌──────────────────┐
│  Your Backend   │                    │  Push Service    │
│                 │                    │  (FCM/APNs)      │
│  VAPID Private  │──[서명]──>         │                  │
│  Key로 JWT 생성 │                    │  VAPID Public    │
└─────────────────┘                    │  Key로 검증      │
                                       └──────────────────┘
                                                │
                                                │ Push
                                                ↓
                                       ┌──────────────────┐
                                       │  User's Browser  │
                                       │                  │
┌─────────────────┐                    │  Service Worker  │
│  Your Frontend  │                    │  가 알림 수신    │
│                 │                    └──────────────────┘
│  VAPID Public   │──[구독 생성]──>
│  Key로 구독     │
└─────────────────┘
```

### VAPID 키 생성 방법

```bash
# web-push 라이브러리 설치
npm install -g web-push

# VAPID 키 생성
web-push generate-vapid-keys

# 출력 예시:
# Public Key: 
# Private Key: 
```

**주의사항:**
- ⚠️ **Private Key는 절대 공개하지 마세요!** (서버에만 저장)
- ✅ **Public Key는 프론트엔드에 포함 가능** (구독 시 사용)
- 🔄 키를 변경하면 **모든 기존 구독이 무효화**됩니다

---

## 🏗️ 아키텍처

### 전체 흐름도

```
┌──────────────────────────────────────────────────────────────────────┐
│                          1. 구독 단계 (최초 1회)                        │
└──────────────────────────────────────────────────────────────────────┘

  Frontend                     Backend                    Database
    │                            │                           │
    │  알림 허용 요청             │                           │
    ├──────────────>            │                           │
    │  브라우저 권한 획득         │                           │
    │                            │                           │
    │  POST /api/push/subscribe  │                           │
    ├───────────────────────────>│                           │
    │                            │  INSERT                   │
    │                            ├──────────────────────────>│
    │                            │  web_push_subscriptions   │
    │  ✅ 구독 완료              │                           │
    │<───────────────────────────│                           │


┌──────────────────────────────────────────────────────────────────────┐
│                       2. 알림 전송 단계 (매번)                         │
└──────────────────────────────────────────────────────────────────────┘

  Frontend                     Backend                    Database
    │                            │                           │
    │  POST /api/push/queue      │                           │
    ├───────────────────────────>│                           │
    │                            │  INSERT                   │
    │                            ├──────────────────────────>│
    │                            │  push_notifications_queue │
    │  ✅ 큐에 추가됨            │  (status: pending)        │
    │<───────────────────────────│                           │


┌──────────────────────────────────────────────────────────────────────┐
│                    3. 워커 처리 단계 (5초마다 자동)                     │
└──────────────────────────────────────────────────────────────────────┘

  Background Worker            Database                Push Service
    │                            │                           │
    │  [5초마다 실행]             │                           │
    │  SELECT pending items      │                           │
    ├───────────────────────────>│                           │
    │                            │                           │
    │  SELECT subscriptions      │                           │
    ├───────────────────────────>│                           │
    │                            │                           │
    │  webpush.sendNotification  │                           │
    ├──────────────────────────────────────────────────────>│
    │                            │                     FCM/APNs
    │                            │                     전송    │
    │  UPDATE status = 'sent'    │                           │
    ├───────────────────────────>│                           │
    │                            │                           │
    │                            │                           ↓
    │                            │                    ┌──────────────┐
    │                            │                    │   Browser    │
    │                            │                    │ Service Worker│
    │                            │                    │  알림 표시    │
    │                            │                    └──────────────┘
```

### 데이터베이스 구조

#### 1. `web_push_subscriptions` - 구독 정보

```sql
CREATE TABLE web_push_subscriptions (
  id UUID PRIMARY KEY,
  member_id UUID,              -- 일반 회원 ID
  target_id TEXT,              -- 파트너 ID (둘 중 하나만 설정)
  endpoint TEXT NOT NULL,      -- Push Service URL
  p256dh TEXT NOT NULL,        -- 공개키 (암호화용)
  auth TEXT NOT NULL,          -- 인증키
  user_agent TEXT,             -- 브라우저 정보
  created_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,    -- 마지막 전송 시간

  UNIQUE(endpoint)
);
```

#### 2. `push_notifications_queue` - 알림 큐

```sql
CREATE TABLE push_notifications_queue (
  id UUID PRIMARY KEY,
  user_id UUID,                -- 발신자 ID
  target_member_id UUID,       -- 수신자 (회원)
  target_partner_id TEXT,      -- 수신자 (파트너)
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  icon TEXT,
  url TEXT,
  tag TEXT,
  notification_type TEXT,      -- message, request, payment, system, call, review
  data JSONB,
  status TEXT,                 -- pending, processing, sent, failed
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,
  scheduled_at TIMESTAMPTZ,    -- 예약 전송 시간
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

---

## ⚙️ 백엔드 설정

### 1. 환경 변수 설정

`.env` 파일에 다음 변수를 추가하세요:

```env
# VAPID 키 (필수)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=

# 푸시 큐 워커 설정 (선택)
PUSH_QUEUE_INTERVAL=5000        # 처리 주기 (밀리초, 기본: 5초)
PUSH_QUEUE_BATCH_SIZE=50        # 한 번에 처리할 개수 (기본: 50)
ENABLE_PUSH_QUEUE_WORKER=true   # 워커 활성화 (기본: true)

# Supabase 설정 (이미 있음)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 2. 마이그레이션 실행

데이터베이스 마이그레이션이 실행되었는지 확인하세요:

```bash
# Supabase CLI 사용
supabase db push

# 또는 Supabase 대시보드에서 SQL Editor로 실행:
# - supabase/migrations/create_push_subscriptions.sql
# - supabase/migrations/20250116000000_create_push_notifications_queue.sql
# - supabase/migrations/20250115000000_create_push_trigger.sql
```

### 3. 서버 시작 확인

서버를 시작하면 다음 로그가 나타나야 합니다:

```bash
npm run dev

# 출력:
# 🚀 Server running on port 4000
# 📬 Push queue worker started (interval: 5s, batch size: 50)
```

### 4. API 엔드포인트

| Method | Endpoint | 설명 | 인증 |
|--------|----------|------|------|
| POST | `/api/push/subscribe` | 푸시 구독 저장 | ✅ |
| DELETE | `/api/push/unsubscribe` | 푸시 구독 제거 | ✅ |
| POST | `/api/push/queue` | 알림 큐에 추가 (권장) | ✅ |
| POST | `/api/push/send` | 즉시 전송 (긴급용) | ✅ |
| GET | `/api/push/queue/status` | 큐 상태 조회 | ✅ |
| POST | `/api/push/process` | 워커 수동 실행 | ⚠️ |

---

## 💻 프론트엔드 구현

### 1. Service Worker 등록

`public/sw.js` 파일을 생성하세요:

```javascript
// public/sw.js
self.addEventListener('push', function(event) {
  console.log('🔔 Push 이벤트 수신:', event);

  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    console.error('Push 데이터 파싱 실패:', e);
    data = {
      title: '새 알림',
      body: '새로운 알림이 도착했습니다.'
    };
  }

  const options = {
    body: data.body || '새로운 알림이 도착했습니다.',
    icon: data.icon || '/favicon.ico',
    badge: '/badge.png',
    tag: data.tag || 'mateyou-notification',
    data: {
      url: data.url || '/',
      ...data.data
    },
    requireInteraction: false,  // 자동으로 사라짐
    vibrate: [200, 100, 200],   // 진동 패턴 (모바일)
    actions: [
      {
        action: 'open',
        title: '열기'
      },
      {
        action: 'close',
        title: '닫기'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '새 알림', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  console.log('🔔 알림 클릭:', event.action);

  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  // 'open' 액션 또는 알림 본문 클릭
  const urlToOpen = event.notification.data.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        // 이미 열린 탭이 있으면 포커스
        for (let client of clientList) {
          if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus();
          }
        }
        // 없으면 새 탭 열기
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

self.addEventListener('notificationclose', function(event) {
  console.log('🔔 알림 닫힘:', event);
});
```

### 2. Service Worker 등록 (앱 진입점)

```typescript
// App.tsx 또는 index.tsx
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('이 브라우저는 Service Worker를 지원하지 않습니다.');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('✅ Service Worker 등록 성공:', registration);
    return registration;
  } catch (error) {
    console.error('❌ Service Worker 등록 실패:', error);
    return null;
  }
}

// 앱 시작 시 호출
registerServiceWorker();
```

### 3. 푸시 구독 Hook

```typescript
// hooks/usePushNotification.ts
import { useState, useEffect } from 'react';

const VAPID_PUBLIC_KEY = '';
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

// Base64 URL-safe 문자열을 Uint8Array로 변환
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ArrayBuffer를 Base64 문자열로 변환
function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function usePushNotification() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isLoading, setIsLoading] = useState(false);

  // 권한 상태 확인
  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // 현재 구독 상태 확인
  useEffect(() => {
    checkSubscription();
  }, []);

  async function checkSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error('구독 상태 확인 실패:', error);
    }
  }

  async function subscribe(accessToken: string) {
    setIsLoading(true);

    try {
      // 1. 권한 요청
      if (permission === 'default') {
        const perm = await Notification.requestPermission();
        setPermission(perm);
        if (perm !== 'granted') {
          throw new Error('알림 권한이 거부되었습니다.');
        }
      } else if (permission === 'denied') {
        throw new Error('알림 권한이 차단되었습니다. 브라우저 설정에서 허용해주세요.');
      }

      // 2. Service Worker 등록 대기
      const registration = await navigator.serviceWorker.ready;

      // 3. 푸시 구독
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      console.log('✅ 푸시 구독 성공:', subscription);

      // 4. 백엔드에 구독 정보 저장
      const response = await fetch(`${API_BASE_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
            auth: arrayBufferToBase64(subscription.getKey('auth'))
          }
        })
      });

      if (!response.ok) {
        throw new Error('구독 정보 저장 실패');
      }

      const result = await response.json();
      console.log('✅ 구독 정보 저장 성공:', result);

      setIsSubscribed(true);
      return true;
    } catch (error) {
      console.error('❌ 푸시 구독 실패:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  async function unsubscribe(accessToken: string) {
    setIsLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        setIsSubscribed(false);
        return true;
      }

      // 1. 백엔드에서 구독 제거
      await fetch(`${API_BASE_URL}/api/push/unsubscribe`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint
        })
      });

      // 2. 브라우저에서 구독 제거
      await subscription.unsubscribe();

      setIsSubscribed(false);
      console.log('✅ 푸시 구독 해제 성공');
      return true;
    } catch (error) {
      console.error('❌ 푸시 구독 해제 실패:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  async function sendNotification(
    accessToken: string,
    options: {
      targetMemberId?: string;
      targetPartnerId?: string;
      title: string;
      body: string;
      type?: 'message' | 'request' | 'payment' | 'system' | 'call' | 'review';
      url?: string;
      icon?: string;
      tag?: string;
      data?: Record<string, any>;
      immediate?: boolean;  // true면 /send 사용, false면 /queue 사용
    }
  ) {
    try {
      const endpoint = options.immediate ? '/api/push/send' : '/api/push/queue';

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target_member_id: options.targetMemberId,
          target_partner_id: options.targetPartnerId,
          title: options.title,
          body: options.body,
          notification_type: options.type || 'system',
          url: options.url || '/',
          icon: options.icon,
          tag: options.tag,
          data: options.data
        })
      });

      if (!response.ok) {
        throw new Error('알림 전송 실패');
      }

      const result = await response.json();
      console.log(`✅ 알림 ${options.immediate ? '전송' : '큐 추가'} 성공:`, result);
      return result;
    } catch (error) {
      console.error('❌ 알림 전송 실패:', error);
      throw error;
    }
  }

  return {
    isSubscribed,
    permission,
    isLoading,
    subscribe,
    unsubscribe,
    sendNotification
  };
}
```

### 4. 사용 예시

```typescript
// components/PushNotificationButton.tsx
import { usePushNotification } from '../hooks/usePushNotification';
import { useSupabaseClient } from '@supabase/supabase-js';

function PushNotificationButton() {
  const supabase = useSupabaseClient();
  const { isSubscribed, permission, isLoading, subscribe, unsubscribe } = usePushNotification();

  const handleToggle = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      alert('로그인이 필요합니다.');
      return;
    }

    try {
      if (isSubscribed) {
        await unsubscribe(session.access_token);
        alert('푸시 알림이 비활성화되었습니다.');
      } else {
        await subscribe(session.access_token);
        alert('푸시 알림이 활성화되었습니다!');
      }
    } catch (error: any) {
      alert(error.message);
    }
  };

  if (permission === 'denied') {
    return (
      <div className="alert alert-warning">
        알림 권한이 차단되었습니다. 브라우저 설정에서 허용해주세요.
      </div>
    );
  }

  return (
    <button onClick={handleToggle} disabled={isLoading}>
      {isLoading ? '처리 중...' : isSubscribed ? '🔔 알림 끄기' : '🔕 알림 켜기'}
    </button>
  );
}
```

```typescript
// 채팅 메시지 전송 시 알림 보내기
import { usePushNotification } from '../hooks/usePushNotification';

function ChatInput({ receiverId, roomId }: Props) {
  const { sendNotification } = usePushNotification();
  const supabase = useSupabaseClient();

  const handleSendMessage = async (message: string) => {
    // 1. 메시지 전송
    await sendMessageToDatabase(message);

    // 2. 상대방에게 푸시 알림
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await sendNotification(session.access_token, {
        targetMemberId: receiverId,
        title: '새로운 메시지',
        body: message,
        type: 'message',
        url: `/chat?room=${roomId}`,
        icon: '/chat-icon.png',
        tag: `chat-${roomId}`,
        data: { roomId, senderId: session.user.id }
      });
    }
  };

  return (
    // ...
  );
}
```

---

## 🧪 테스트 방법

### 1. 브라우저에서 수동 테스트

#### Step 1: Service Worker 확인

1. 브라우저 개발자 도구 열기 (F12)
2. **Application** 탭 → **Service Workers**
3. `sw.js`가 등록되어 있는지 확인
4. 상태가 **activated and is running**인지 확인

#### Step 2: 알림 권한 확인

1. 주소창 왼쪽 자물쇠 아이콘 클릭
2. **알림** 권한이 **허용**으로 되어 있는지 확인
3. 차단되어 있다면 **허용**으로 변경

#### Step 3: 구독 테스트

브라우저 Console에서 실행:

```javascript
// 1. VAPID Public Key 설정
const VAPID_PUBLIC_KEY = '';

// 2. Base64 변환 함수
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// 3. 구독 생성
navigator.serviceWorker.ready.then(async (registration) => {
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });

  console.log('✅ 구독 성공:', subscription);
  console.log('Endpoint:', subscription.endpoint);
});
```

#### Step 4: 백엔드에 구독 저장

Postman 또는 curl로 테스트:

```bash
curl -X POST http://localhost:4000/api/push/subscribe \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "구독에서_얻은_endpoint",
    "keys": {
      "p256dh": "구독에서_얻은_p256dh",
      "auth": "구독에서_얻은_auth"
    }
  }'
```

#### Step 5: 테스트 알림 전송

```bash
# 큐에 추가 (5초 후 자동 전송)
curl -X POST http://localhost:4000/api/push/queue \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "target_member_id": "YOUR_MEMBER_ID",
    "title": "🧪 테스트 알림",
    "body": "Push 알림 시스템이 정상 동작합니다!",
    "notification_type": "system",
    "url": "/",
    "tag": "test"
  }'
```

### 2. 데이터베이스 확인

#### 구독 정보 확인

```sql
-- Supabase SQL Editor에서 실행
SELECT
  id,
  member_id,
  target_id,
  endpoint,
  created_at,
  last_used_at
FROM web_push_subscriptions
ORDER BY created_at DESC
LIMIT 10;
```

예상 결과:
- member_id 또는 target_id 중 하나만 값이 있어야 함
- endpoint가 `https://fcm.googleapis.com/...` 또는 다른 Push Service URL이어야 함

#### 큐 상태 확인

```sql
SELECT
  id,
  target_member_id,
  title,
  body,
  status,
  retry_count,
  error_message,
  created_at,
  processed_at
FROM push_notifications_queue
ORDER BY created_at DESC
LIMIT 10;
```

**status 의미:**
- `pending`: 대기 중 (5초 이내에 처리됨)
- `processing`: 현재 처리 중
- `sent`: 전송 완료 ✅
- `failed`: 전송 실패 ❌ (error_message 확인)

### 3. 백엔드 로그 확인

서버 터미널에서 다음 로그를 확인하세요:

```bash
# 정상 동작 로그
📬 Push queue worker started (interval: 5s, batch size: 50)
📬 Processing 1 push notifications...
✅ Push queue processed: 1 total, 1 sent, 0 failed

# 에러 발생 시
❌ Failed to send push to https://fcm.googleapis.com/...
Error: ...
```

### 4. 자동화 테스트 스크립트

```typescript
// scripts/test-push.ts
import fetch from 'node-fetch';

const API_URL = 'http://localhost:4000';
const ACCESS_TOKEN = 'YOUR_ACCESS_TOKEN';
const TARGET_MEMBER_ID = 'YOUR_MEMBER_ID';

async function testPushNotification() {
  console.log('🧪 Push 알림 테스트 시작...\n');

  // 1. 큐에 테스트 알림 추가
  console.log('1️⃣ 큐에 알림 추가 중...');
  const queueResponse = await fetch(`${API_URL}/api/push/queue`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      target_member_id: TARGET_MEMBER_ID,
      title: '🧪 자동 테스트',
      body: `테스트 시간: ${new Date().toLocaleString('ko-KR')}`,
      notification_type: 'system',
      url: '/',
      tag: 'auto-test'
    })
  });

  const queueResult = await queueResponse.json();
  console.log('✅ 큐 추가 완료:', queueResult);

  // 2. 5초 대기 (워커가 처리할 시간)
  console.log('\n2️⃣ 워커 처리 대기 중 (5초)...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 3. 큐 상태 확인
  console.log('\n3️⃣ 큐 상태 확인 중...');
  const statusResponse = await fetch(`${API_URL}/api/push/queue/status?limit=1`, {
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`
    }
  });

  const statusResult = await statusResponse.json();
  console.log('✅ 큐 상태:', statusResult);

  // 4. 결과 분석
  console.log('\n📊 테스트 결과:');
  if (statusResult.data && statusResult.data[0]) {
    const item = statusResult.data[0];
    if (item.status === 'sent') {
      console.log('✅ 성공! 알림이 전송되었습니다.');
      console.log('   - 처리 시간:', item.processed_at);
    } else if (item.status === 'failed') {
      console.log('❌ 실패! 알림 전송에 실패했습니다.');
      console.log('   - 에러:', item.error_message);
    } else {
      console.log('⏳ 아직 처리 중입니다. 잠시 후 다시 확인해주세요.');
    }
  }

  console.log('\n📈 전체 통계:', statusResult.meta?.stats);
}

testPushNotification();
```

실행:
```bash
npx tsx scripts/test-push.ts
```

---

## 🔧 트러블슈팅

### 문제 1: 알림이 전혀 오지 않음

#### 증상
- 큐에 추가는 되는데 알림이 안 옴
- 브라우저에서 알림이 표시되지 않음

#### 진단 체크리스트

```sql
-- ✅ Step 1: 구독 정보가 있는지 확인
SELECT COUNT(*) as subscription_count
FROM web_push_subscriptions
WHERE member_id = 'YOUR_MEMBER_ID';

-- 결과가 0이면: 프론트엔드에서 구독을 안 한 것
-- 해결: /api/push/subscribe API 호출
```

```sql
-- ✅ Step 2: 큐 상태 확인
SELECT status, COUNT(*) as count
FROM push_notifications_queue
GROUP BY status;

-- pending이 계속 쌓이면: 워커가 동작 안 함
-- failed가 많으면: 전송 에러
-- sent인데 알림 안 오면: 프론트엔드 Service Worker 문제
```

```bash
# ✅ Step 3: 백엔드 로그 확인
# 서버 터미널에서 다음 로그를 찾으세요:

# 워커가 실행되지 않는 경우:
# ❌ "Push queue worker started" 메시지가 없음
# 해결: ENABLE_PUSH_QUEUE_WORKER=true 확인

# 구독이 없는 경우:
# ❌ "No push subscriptions found"
# 해결: 프론트엔드에서 구독 필요

# 전송 실패:
# ❌ "Failed to send push to https://fcm.googleapis.com/..."
# 해결: VAPID 키 확인 또는 구독 재등록
```

#### 해결 방법

1. **Service Worker 확인**
   ```javascript
   // 브라우저 Console에서 실행
   navigator.serviceWorker.getRegistration().then(reg => {
     console.log('Service Worker:', reg);
     if (!reg) {
       console.error('❌ Service Worker가 등록되지 않았습니다!');
     }
   });
   ```

2. **알림 권한 확인**
   ```javascript
   console.log('알림 권한:', Notification.permission);
   // 'denied'면: 브라우저 설정에서 허용 필요
   // 'default'면: Notification.requestPermission() 호출 필요
   // 'granted'면: 정상
   ```

3. **구독 재등록**
   ```javascript
   // 기존 구독 삭제 후 재등록
   navigator.serviceWorker.ready.then(async (reg) => {
     const sub = await reg.pushManager.getSubscription();
     if (sub) {
       await sub.unsubscribe();
       console.log('✅ 기존 구독 제거');
     }
     // 다시 구독 (앱에서 구독 버튼 클릭)
   });
   ```

4. **테스트 알림 직접 전송**
   ```bash
   # 큐를 거치지 않고 즉시 전송
   curl -X POST http://localhost:4000/api/push/send \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "target_member_id": "YOUR_ID",
       "title": "직접 테스트",
       "body": "즉시 전송 테스트"
     }'
   ```

### 문제 2: 큐가 `sent` 상태인데 알림이 안 옴

#### 증상
```sql
SELECT * FROM push_notifications_queue WHERE status = 'sent';
-- ✅ sent 상태인데 브라우저에서 알림이 안 보임
```

#### 원인
백엔드에서는 전송을 성공했지만, **프론트엔드 Service Worker**가 없거나 제대로 동작하지 않음

#### 해결 방법

1. **Service Worker 재등록**
   ```bash
   # 브라우저 개발자 도구 → Application → Service Workers
   # → Unregister 클릭 → 페이지 새로고침
   ```

2. **Service Worker 코드 확인**
   ```javascript
   // public/sw.js 파일이 있는지 확인
   // push 이벤트 핸들러가 있는지 확인
   self.addEventListener('push', function(event) {
     // 이 코드가 있어야 함!
   });
   ```

3. **브라우저 알림 설정 확인**
   - Windows: 설정 → 시스템 → 알림 → 브라우저 알림 허용
   - macOS: 시스템 환경설정 → 알림 → Chrome/Edge → 알림 허용
   - 집중 모드/방해 금지 모드 확인

### 문제 3: `failed` 상태로 계속 실패

#### 증상
```sql
SELECT id, error_message, retry_count
FROM push_notifications_queue
WHERE status = 'failed';

-- error_message 확인!
```

#### 흔한 에러 메시지와 해결법

| 에러 메시지 | 원인 | 해결 방법 |
|-----------|------|---------|
| `No push subscriptions found` | 구독 정보가 DB에 없음 | 프론트엔드에서 `/api/push/subscribe` 호출 |
| `VAPID keys are not configured` | .env에 VAPID 키 없음 | .env 파일에 VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY 추가 |
| `401 Unauthorized` | VAPID 키가 잘못됨 | 새 VAPID 키 생성 후 재구독 필요 |
| `410 Gone` | 구독이 만료됨 | 자동으로 삭제됨, 재구독 필요 |
| `All subscriptions failed` | 모든 구독에서 전송 실패 | 위의 에러들을 먼저 확인 |

#### VAPID 키 재생성

```bash
# 1. 새 VAPID 키 생성
web-push generate-vapid-keys

# 2. .env 파일 업데이트
VAPID_PUBLIC_KEY=새_Public_Key
VAPID_PRIVATE_KEY=새_Private_Key

# 3. 서버 재시작
npm run dev

# 4. ⚠️ 모든 사용자가 재구독 필요!
# 프론트엔드에서 구독 버튼을 다시 눌러야 함
```

### 문제 4: FCM 관련 에러

#### 증상
```
endpoint: "https://fcm.googleapis.com/fcm/send/..."
```
FCM endpoint인데 전송 실패

#### 원인
- VAPID 키만으로는 FCM이 제대로 동작 안 할 수 있음
- 최신 Chrome/Edge는 VAPID로 충분하지만, 일부 환경에서는 FCM Server Key 필요

#### 해결 방법 (선택사항)

현재 코드는 VAPID만 사용하므로 문제없어야 하지만, 만약 계속 실패한다면:

1. **Firebase 프로젝트 생성** (선택사항)
   - https://console.firebase.google.com
   - 프로젝트 설정 → Cloud Messaging
   - Server Key 복사

2. **.env에 추가** (선택사항)
   ```env
   FCM_SERVER_KEY=your_fcm_server_key
   ```

3. **코드 수정 불필요**
   - web-push 라이브러리가 자동으로 처리

### 문제 5: 모바일에서 안 옴

#### 증상
- PC 브라우저에서는 알림이 오는데
- 모바일 브라우저에서는 안 옴

#### 원인 및 해결

| 플랫폼 | 브라우저 | 지원 여부 | 참고 |
|-------|---------|----------|------|
| Android | Chrome | ✅ 지원 | 정상 동작해야 함 |
| Android | Firefox | ✅ 지원 | 정상 동작해야 함 |
| Android | Samsung Internet | ✅ 지원 | 정상 동작해야 함 |
| iOS/iPadOS | Safari | ⚠️ iOS 16.4+ | macOS 13+, 홈 화면 추가 앱만 |
| iOS | Chrome/Edge | ❌ 미지원 | iOS의 Chrome/Edge는 Safari 엔진 사용 |

**iOS Safari 설정 (iOS 16.4+):**
1. 앱을 홈 화면에 추가 (PWA로 설치)
2. 홈 화면 아이콘에서 앱 실행
3. 그러면 푸시 알림 동작

### 문제 6: 개발자 도구에서 에러 발생

#### 흔한 Console 에러

```javascript
// ❌ DOMException: Registration failed - missing 'applicationServerKey'
// 원인: VAPID Public Key가 잘못됨
// 해결: urlBase64ToUint8Array() 함수 확인 및 VAPID_PUBLIC_KEY 확인

// ❌ DOMException: Registration failed - permission denied
// 원인: 알림 권한이 차단됨
// 해결: 브라우저 설정에서 알림 허용

// ❌ TypeError: Failed to execute 'subscribe' on 'PushManager'
// 원인: Service Worker가 HTTPS에서만 동작 (localhost 제외)
// 해결: HTTPS 사용 또는 localhost에서 테스트

// ❌ push 이벤트가 발생했는데 알림이 안 보임
// 원인: sw.js의 showNotification()이 호출 안 됨
// 해결: sw.js 코드 확인
```

### 문제 7: 백엔드 워커가 실행 안 됨

#### 증상
```bash
# 로그에 이 메시지가 없음:
📬 Push queue worker started
```

#### 해결

1. **환경 변수 확인**
   ```env
   # .env 파일
   ENABLE_PUSH_QUEUE_WORKER=true  # false로 되어 있지 않은지 확인
   ```

2. **서버 재시작**
   ```bash
   npm run dev
   ```

3. **수동 실행 테스트**
   ```bash
   curl -X POST http://localhost:4000/api/push/process \
     -H "Content-Type: application/json" \
     -d '{"batchSize": 50}'
   ```

---

## ❓ FAQ

### Q1. VAPID 키를 변경하면 어떻게 되나요?

**A:** 모든 기존 구독이 무효화됩니다. 사용자들이 다시 구독해야 합니다.

**권장 사항:**
- 프로덕션에서는 VAPID 키를 절대 변경하지 마세요
- 변경이 필요하다면:
  1. 새 키로 서버 배포
  2. 프론트엔드에서 자동으로 재구독하도록 로직 추가
  3. 모든 사용자에게 공지

### Q2. /api/push/queue vs /api/push/send 중 뭘 써야 하나요?

**A:** 거의 모든 경우에 `/api/push/queue`를 사용하세요.

| 상황 | 추천 API | 이유 |
|-----|---------|------|
| 채팅 메시지 | `/queue` | 5초 지연은 문제없고, 안정적 |
| 의뢰 알림 | `/queue` | 동일 |
| 시스템 알림 | `/queue` | 동일 |
| 긴급 전화 알림 | `/send` | 즉시 전송 필요 |
| 결제 완료 | `/queue` | 5초 지연 괜찮음 |

### Q3. 알림이 중복으로 여러 개 오는 것 같아요.

**A:** `tag` 속성을 사용하세요.

```typescript
await sendNotification(token, {
  title: '새 메시지',
  body: '안녕하세요',
  tag: `chat-${roomId}`,  // 같은 tag는 덮어씌워짐
});
```

같은 `tag`를 가진 알림은 브라우저가 자동으로 하나만 표시합니다.

### Q4. 알림 클릭 시 앱을 열고 싶어요.

**A:** Service Worker의 `notificationclick` 이벤트에서 처리됩니다.

```javascript
// sw.js
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const urlToOpen = event.notification.data.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then(clientList => {
        // 이미 열린 탭이 있으면 포커스
        for (let client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // 없으면 새 탭
        return clients.openWindow(urlToOpen);
      })
  );
});
```

### Q5. 사용자별로 다른 아이콘을 보여줄 수 있나요?

**A:** 네, `icon` 파라미터를 사용하세요.

```typescript
await sendNotification(token, {
  title: senderName,
  body: message,
  icon: senderProfileImageUrl,  // 동적으로 설정
  url: `/chat?room=${roomId}`
});
```

### Q6. 알림 통계를 확인하고 싶어요.

**A:** `/api/push/queue/status` 엔드포인트를 사용하세요.

```bash
curl -X GET "http://localhost:4000/api/push/queue/status" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

응답:
```json
{
  "success": true,
  "data": [...],
  "meta": {
    "total": 100,
    "stats": {
      "pending": 5,
      "processing": 1,
      "sent": 90,
      "failed": 4
    }
  }
}
```

### Q7. 한 사용자가 여러 기기에서 로그인하면?

**A:** 모든 기기에 알림이 갑니다.

- `web_push_subscriptions` 테이블은 `endpoint`가 UNIQUE
- 사용자가 PC, 모바일 각각에서 구독하면 2개의 구독이 생성됨
- 알림 전송 시 모든 구독에 전송

### Q8. 알림 발송 비용이 있나요?

**A:** **무료**입니다!

- Web Push는 브라우저 제공 기능
- FCM, APNs 등의 Push Service도 무료
- 서버 비용만 발생 (Supabase, 백엔드 서버)

### Q9. 알림을 예약 전송할 수 있나요?

**A:** 네, `scheduled_at` 파라미터를 사용하세요.

```typescript
await fetch('/api/push/queue', {
  method: 'POST',
  body: JSON.stringify({
    target_member_id: userId,
    title: '예약 알림',
    body: '10분 후에 전송됩니다.',
    scheduled_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  })
});
```

워커가 `scheduled_at` 시간이 되면 자동으로 전송합니다.

### Q10. 프로덕션 배포 시 체크리스트는?

**A:** 다음을 확인하세요:

- [ ] VAPID 키가 .env에 설정됨
- [ ] .env 파일이 .gitignore에 포함됨
- [ ] HTTPS 사용 (HTTP에서는 Service Worker 동작 안 함, localhost 제외)
- [ ] Service Worker 파일 (`sw.js`)이 배포에 포함됨
- [ ] 프론트엔드 빌드에 VAPID Public Key가 포함됨
- [ ] 데이터베이스 마이그레이션 실행됨
- [ ] 백엔드 서버에서 워커 로그 확인 (`📬 Push queue worker started`)
- [ ] 테스트 알림 발송 성공 확인

---

## 📞 지원

문제가 해결되지 않으면:

1. **백엔드 로그 확인**: 터미널에서 에러 메시지 찾기
2. **브라우저 Console 확인**: F12 → Console 탭에서 에러 확인
3. **데이터베이스 확인**: Supabase SQL Editor에서 구독/큐 상태 확인
4. **이슈 등록**: GitHub Issues에 다음 정보와 함께 등록
   - 백엔드 로그
   - 브라우저 Console 에러
   - SQL 쿼리 결과
   - 환경 정보 (OS, 브라우저, 버전)

---

## 📝 변경 이력

| 날짜 | 버전 | 변경 내용 |
|-----|------|---------|
| 2025-01-15 | 1.0.0 | Database Trigger 추가 |
| 2025-01-16 | 1.1.0 | 큐 시스템 추가 |
| 2025-01-23 | 1.2.0 | 통합 가이드 문서 작성 |

---

**작성자**: MateYou Development Team
**최종 수정**: 2025-01-23
**문서 버전**: 1.2.0
