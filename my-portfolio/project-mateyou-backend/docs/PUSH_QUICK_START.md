# Push 알림 빠른 시작 가이드 (5분 완성)

> 💡 **상세 가이드**는 [PUSH_NOTIFICATION_COMPLETE_GUIDE.md](./PUSH_NOTIFICATION_COMPLETE_GUIDE.md)를 참고하세요.

## ⚡ 빠른 시작

### 1단계: 백엔드 설정 (1분)

**.env 파일 확인:**
```env
# 이미 설정되어 있어야 함
VAPID_PUBLIC_KEY=BAEeVAO9VR3Sr0qtDlPpwjD-1FuvoFBjKlGqDgt7Cfi_7NbGn_GYYu04vDty6qH5W4ecgygtwmZbEYHMstXKlNM
VAPID_PRIVATE_KEY=9iKmRYNZ8CSRiCOiu3a4zrwMOQPhxr0XqEG23RBp62k
```

**서버 시작:**
```bash
npm run dev

# 이 로그가 나와야 함:
# 📬 Push queue worker started (interval: 5s, batch size: 50)
```

### 2단계: 프론트엔드 - Service Worker (2분)

**`public/sw.js` 파일 생성:**
```javascript
self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};

  event.waitUntil(
    self.registration.showNotification(data.title || '새 알림', {
      body: data.body,
      icon: data.icon || '/favicon.ico',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});
```

**앱 진입점에서 등록 (`App.tsx` 또는 `index.tsx`):**
```typescript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

### 3단계: 구독 버튼 만들기 (2분)

```typescript
// components/PushSubscribeButton.tsx
import { useState } from 'react';

const VAPID_KEY = 'BAEeVAO9VR3Sr0qtDlPpwjD-1FuvoFBjKlGqDgt7Cfi_7NbGn_GYYu04vDty6qH5W4ecgygtwmZbEYHMstXKlNM';
const API_URL = 'http://localhost:4000';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null) {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function PushSubscribeButton({ accessToken }: { accessToken: string }) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      // 1. 권한 요청
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('알림 권한이 필요합니다.');
        return;
      }

      // 2. 브라우저 구독
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY)
      });

      // 3. 백엔드에 저장
      await fetch(`${API_URL}/api/push/subscribe`, {
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

      setIsSubscribed(true);
      alert('✅ 푸시 알림 구독 완료!');
    } catch (error) {
      console.error(error);
      alert('❌ 구독 실패: ' + error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleSubscribe} disabled={loading || isSubscribed}>
      {loading ? '처리 중...' : isSubscribed ? '✅ 구독됨' : '🔔 알림 켜기'}
    </button>
  );
}
```

### 4단계: 알림 보내기

**채팅 메시지 전송 시:**
```typescript
// 메시지 전송 후
await fetch('http://localhost:4000/api/push/queue', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    target_member_id: receiverId,
    title: '새 메시지',
    body: message,
    notification_type: 'message',
    url: `/chat?room=${roomId}`
  })
});
// 5초 이내에 자동 전송됨!
```

---

## 🧪 즉시 테스트하기

### 방법 1: 브라우저 Console

```javascript
// 1. 구독
const VAPID_KEY = 'BAEeVAO9VR3Sr0qtDlPpwjD-1FuvoFBjKlGqDgt7Cfi_7NbGn_GYYu04vDty6qH5W4ecgygtwmZbEYHMstXKlNM';

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

navigator.serviceWorker.ready.then(reg => {
  reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_KEY)
  }).then(sub => console.log('✅ 구독 완료:', sub));
});
```

### 방법 2: curl 명령어

```bash
# 테스트 알림 전송
curl -X POST http://localhost:4000/api/push/queue \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "target_member_id": "YOUR_MEMBER_ID",
    "title": "🧪 테스트",
    "body": "Push 알림 테스트입니다!",
    "notification_type": "system"
  }'

# 5초 후 브라우저에 알림이 나타남!
```

---

## 🔍 문제 해결 (1분 체크리스트)

알림이 안 오면 순서대로 확인:

### ✅ 1. 백엔드 로그
```bash
# 터미널에서 확인
📬 Push queue worker started  # 이 메시지가 있어야 함
```

### ✅ 2. 브라우저 권한
```javascript
// Console에서 실행
console.log(Notification.permission);
// "granted"가 나와야 함. "denied"면 브라우저 설정에서 허용
```

### ✅ 3. Service Worker
```
개발자 도구 (F12) → Application → Service Workers
sw.js가 "activated and is running" 상태여야 함
```

### ✅ 4. 구독 정보
```sql
-- Supabase SQL Editor에서 실행
SELECT * FROM web_push_subscriptions WHERE member_id = 'YOUR_ID';
-- 결과가 있어야 함. 없으면 구독 버튼 클릭
```

### ✅ 5. 큐 상태
```sql
SELECT * FROM push_notifications_queue ORDER BY created_at DESC LIMIT 5;
-- status가 'sent'면 전송됨, 'failed'면 error_message 확인
```

---

## 📚 더 알아보기

- **상세 가이드**: [PUSH_NOTIFICATION_COMPLETE_GUIDE.md](./PUSH_NOTIFICATION_COMPLETE_GUIDE.md)
  - VAPID 상세 설명
  - 아키텍처 다이어그램
  - 트러블슈팅
  - FAQ

- **백엔드 가이드**: [PUSH_QUEUE_GUIDE.md](./PUSH_QUEUE_GUIDE.md)
  - API 문서
  - 환경 변수 설정
  - 큐 관리

- **프론트엔드 가이드**: [FRONTEND_PUSH_GUIDE.md](./FRONTEND_PUSH_GUIDE.md)
  - React Hook 예제
  - Service Worker 상세
  - 사용 시나리오

---

## 💡 핵심 요약

1. **백엔드**: VAPID 키 설정 → 서버 시작 → 워커 동작 확인
2. **프론트엔드**: sw.js 생성 → Service Worker 등록 → 구독 버튼 클릭
3. **테스트**: 알림 API 호출 → 5초 후 브라우저 알림 확인
4. **문제 발생**: 백엔드 로그 → 브라우저 권한 → Service Worker → 구독 정보 순으로 확인

**모든 게 정상이면**: 큐에 추가 후 5초 이내에 알림이 옵니다! 🎉
