# 프론트엔드 푸시 알림 사용 가이드

이 문서는 프론트엔드에서 푸시 알림 시스템을 사용하는 방법을 설명합니다.

## 📋 사용 흐름

### 기본 흐름

```
1. 앱 시작 시 / 로그인 시
   ↓
   /api/push/subscribe (한 번만 호출)
   ↓
   사용자가 푸시 알림 허용
   ↓
2. 푸시 알림을 보내야 할 때
   ↓
   /api/push/queue (일반적인 경우 - 큐에 추가)
   또는
   /api/push/send (긴급한 경우 - 즉시 전송)
```

## 🔄 API 사용 시나리오

### 1. `/api/push/subscribe` - 구독 저장

**언제 사용?**
- 앱 시작 시 또는 사용자가 푸시 알림을 허용할 때
- 한 번만 호출하면 됩니다 (브라우저가 구독 정보를 제공할 때)

**사용 예시:**
```typescript
// 사용자가 푸시 알림 허용 버튼 클릭 시
async function subscribeToPush() {
  try {
    // 1. 브라우저에서 푸시 알림 권한 요청
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: VAPID_PUBLIC_KEY // 백엔드에서 제공하는 공개 키
    });

    // 2. 구독 정보를 백엔드에 저장
    const response = await fetch('http://localhost:4000/api/push/subscribe', {
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

    const result = await response.json();
    console.log('푸시 구독 완료:', result);
  } catch (error) {
    console.error('푸시 구독 실패:', error);
  }
}
```

### 2. `/api/push/queue` - 큐에 추가 (권장)

**언제 사용?**
- 일반적인 푸시 알림을 보낼 때
- 메시지 알림, 의뢰 알림, 시스템 알림 등
- 백그라운드 워커가 자동으로 처리하므로 비동기적으로 처리됨

**사용 예시:**
```typescript
// 채팅 메시지 전송 후 상대방에게 알림 보내기
async function sendMessageNotification(receiverId: string, message: string, senderName: string) {
  try {
    const response = await fetch('http://localhost:4000/api/push/queue', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target_member_id: receiverId,
        title: senderName,
        body: message,
        notification_type: 'message',
        url: `/chat?room_id=${roomId}`,
        tag: `chat-${roomId}`,
        icon: '/icon.png',
        data: {
          room_id: roomId,
          sender_id: senderId,
          message_id: messageId
        }
      })
    });

    const result = await response.json();
    console.log('푸시 알림 큐에 추가됨:', result);
  } catch (error) {
    console.error('푸시 알림 큐 추가 실패:', error);
  }
}

// 파트너에게 의뢰 알림 보내기
async function sendRequestNotification(partnerId: string, requestData: any) {
  try {
    const response = await fetch('http://localhost:4000/api/push/queue', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target_partner_id: partnerId, // 파트너의 partners.id
        title: '새로운 의뢰 요청!',
        body: `${requestData.clientName}님이 ${requestData.jobName} ${requestData.jobCount}회 의뢰를 요청했습니다.`,
        notification_type: 'request',
        url: '/partner/dashboard?tab=requests',
        tag: `new-request-${requestData.requestId}`,
        icon: '/icon.png',
        data: {
          request_id: requestData.requestId,
          client_name: requestData.clientName,
          job_name: requestData.jobName,
          job_count: requestData.jobCount
        }
      })
    });

    const result = await response.json();
    console.log('의뢰 알림 큐에 추가됨:', result);
  } catch (error) {
    console.error('의뢰 알림 큐 추가 실패:', error);
  }
}
```

### 3. `/api/push/send` - 즉시 전송 (선택적)

**언제 사용?**
- 긴급한 알림이 필요할 때
- 큐를 거치지 않고 즉시 전송하고 싶을 때
- 실시간 통화 알림, 긴급 메시지 등

**사용 예시:**
```typescript
// 긴급 통화 알림 (즉시 전송 필요)
async function sendUrgentCallNotification(partnerId: string, callerName: string) {
  try {
    const response = await fetch('http://localhost:4000/api/push/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target_partner_id: partnerId,
        title: '📞 긴급 통화',
        body: `${callerName}님이 통화를 요청했습니다.`,
        notification_type: 'call',
        url: '/voice-call',
        tag: 'urgent-call',
        icon: '/icon.png',
        data: {
          call_id: callId,
          caller_id: callerId,
          caller_name: callerName
        }
      })
    });

    const result = await response.json();
    console.log('긴급 알림 전송됨:', result);
  } catch (error) {
    console.error('긴급 알림 전송 실패:', error);
  }
}
```

## 🎯 실제 사용 예시

### React 예시

```typescript
// hooks/usePushNotification.ts
import { useEffect, useState } from 'react';
import { useSupabaseClient } from '@supabase/supabase-js';

const VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY'; // 환경변수에서 가져오기

export function usePushNotification() {
  const supabase = useSupabaseClient();
  const [isSubscribed, setIsSubscribed] = useState(false);

  // 1. 푸시 구독
  const subscribe = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch('http://localhost:4000/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
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

      if (response.ok) {
        setIsSubscribed(true);
        console.log('푸시 구독 완료');
      }
    } catch (error) {
      console.error('푸시 구독 실패:', error);
    }
  };

  // 2. 푸시 알림 큐에 추가
  const sendNotification = async (
    targetMemberId?: string,
    targetPartnerId?: string,
    notification: {
      title: string;
      body: string;
      type?: 'message' | 'request' | 'payment' | 'system' | 'call' | 'review';
      url?: string;
      data?: Record<string, any>;
    }
  ) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch('http://localhost:4000/api/push/queue', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target_member_id: targetMemberId,
          target_partner_id: targetPartnerId,
          title: notification.title,
          body: notification.body,
          notification_type: notification.type || 'system',
          url: notification.url || '/',
          data: notification.data
        })
      });

      return await response.json();
    } catch (error) {
      console.error('푸시 알림 전송 실패:', error);
      throw error;
    }
  };

  return {
    isSubscribed,
    subscribe,
    sendNotification
  };
}

// 유틸리티 함수
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

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
```

### 사용 예시

```typescript
// components/ChatMessage.tsx
import { usePushNotification } from '../hooks/usePushNotification';

function ChatMessage({ receiverId, message, roomId }: Props) {
  const { sendNotification } = usePushNotification();

  const handleSendMessage = async () => {
    // 메시지 전송 로직...
    
    // 상대방에게 푸시 알림 보내기
    await sendNotification(
      receiverId,
      undefined,
      {
        title: '새로운 메시지',
        body: message,
        type: 'message',
        url: `/chat?room_id=${roomId}`,
        data: { room_id: roomId }
      }
    );
  };

  return (
    // ...
  );
}
```

## 📝 요약

### 일반적인 사용 패턴

1. **앱 시작 시** → `/api/push/subscribe` (한 번만)
2. **일반 알림** → `/api/push/queue` (권장)
3. **긴급 알림** → `/api/push/send` (선택적)

### `/api/push/queue` vs `/api/push/send`

| 구분 | `/api/push/queue` | `/api/push/send` |
|------|-------------------|------------------|
| 처리 방식 | 큐에 추가 후 백그라운드 워커가 처리 | 즉시 전송 |
| 속도 | 약간 지연 가능 (30초 이내) | 즉시 |
| 사용 시나리오 | 일반적인 알림 (메시지, 의뢰 등) | 긴급 알림 (통화, 긴급 메시지) |
| 권장 | ✅ 대부분의 경우 | ⚠️ 긴급한 경우만 |

### 주의사항

1. **구독은 한 번만**: `/api/push/subscribe`는 사용자가 푸시 알림을 허용할 때 한 번만 호출
2. **큐 사용 권장**: 대부분의 경우 `/api/push/queue` 사용 (백그라운드 처리)
3. **즉시 전송은 선택적**: 긴급한 경우에만 `/api/push/send` 사용
4. **인증 필요**: 모든 API는 Bearer 토큰 인증 필요

## 🔧 서비스 워커 설정

프론트엔드에서 푸시 알림을 받으려면 서비스 워커가 필요합니다:

```javascript
// public/sw.js
self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body,
    icon: data.icon || '/icon.png',
    badge: '/badge.png',
    tag: data.tag || 'default',
    data: data.data || {},
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
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow(event.notification.data.url || '/')
    );
  }
});
```

```typescript
// 앱 시작 시 서비스 워커 등록
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(registration => console.log('Service Worker 등록됨'))
    .catch(error => console.error('Service Worker 등록 실패:', error));
}
```

