# 방송 통신 구조 문서

> 실시간 방송 시스템의 통신 흐름, Supabase Realtime 구독, PeerJS 연결을 정리합니다.

---

## 📁 관련 파일 구조

```
src/
├── contexts/
│   ├── GlobalRealtimeProvider.tsx    # 전역 채팅 & 알림 실시간 구독
│   ├── VoiceRoomProvider.tsx         # 보이스 룸 PeerJS 연결 관리
│   ├── VideoRoomProvider.tsx         # 비디오 룸 PeerJS 연결 관리
│   ├── GlobalVoiceCallProvider.tsx   # 1:1 음성 통화
│   └── GlobalVideoCallProvider.tsx   # 1:1 화상 통화
├── hooks/
│   ├── useOptimizedRealtime.ts       # Realtime 채널 재연결 로직
│   ├── useStreamChat.ts              # 스트림 채팅 메시지 전송
│   ├── useStreamDonations.ts         # 후원 Realtime 구독
│   ├── useStreamModeration.ts        # 강퇴/차단/뮤트 (Broadcast)
│   ├── useStreamHeartbeat.ts         # 시청자 heartbeat
│   ├── useVoiceRoom.ts               # 보이스 룸 CRUD & Realtime
│   ├── useTimesheetRealtime.ts       # 타임시트 Realtime
│   └── useVideoDonationPlayer.ts     # 비디오 후원 Broadcast 수신
└── lib/
    └── supabase.ts                   # Supabase 클라이언트
```

---

## 🌐 Supabase Realtime 채널 유형

### 1. **Postgres Changes** (DB 변경 감지)
테이블의 INSERT/UPDATE/DELETE 이벤트를 실시간으로 수신합니다.

```typescript
// 예: useStreamDonations.ts
const channel = supabase
  .channel(`stream-donations-${roomId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'stream_donations',
      filter: `room_id=eq.${roomId}`,
    },
    (payload) => {
      // 새 후원 처리
    }
  )
  .subscribe()
```

### 2. **Broadcast** (서버 중계 메시지)
DB를 거치지 않고 실시간 메시지를 브로드캐스트합니다.

```typescript
// 예: useStreamModeration.ts - 강제 뮤트 알림
const channel = supabase.channel(`force-mute-broadcast-${roomId}`)
channel.send({
  type: 'broadcast',
  event: 'force-mute',
  payload: { targetMemberId, reason }
})
```

### 3. **Presence** (상태 동기화)
참가자의 온라인 상태를 추적합니다.

```typescript
// 예: useOptimizedRealtime.ts
const channel = supabase.channel(`${channelName}-${userId}`, {
  config: {
    presence: { key: userId }
  }
})
```

---

## 🔌 채널 명명 규칙

| 채널 패턴 | 용도 | 파일 |
|-----------|------|------|
| `stream-donations-{roomId}` | 후원 이벤트 | `useStreamDonations.ts` |
| `force-mute-broadcast-{roomId}` | 강제 뮤트 알림 | `useStreamModeration.ts` |
| `ban-detection-{roomId}-{memberId}` | 차단/강퇴 감지 | `useStreamModeration.ts` |
| `voice-peers-{roomId}` | 보이스 P2P 시그널링 | `VoiceRoomProvider.tsx` |
| `video-peers-{roomId}` | 비디오 P2P 시그널링 | `VideoRoomProvider.tsx` |
| `mini-player-{roomId}` | 미니 플레이어 동기화 | `VoiceRoomMiniPlayer.tsx` |
| `global-chat-{userId}` | 전역 채팅 알림 | `GlobalRealtimeProvider.tsx` |
| `global-requests-{userId}` | 파트너 요청 알림 | `GlobalRealtimeProvider.tsx` |

---

## 🎤 PeerJS 연결 구조 (WebRTC)

### 보이스/비디오 룸 P2P Mesh

```
┌──────────────────────────────────────────────────────┐
│                   Supabase Realtime                  │
│              (Broadcast: Signaling 메시지)            │
└──────────────────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
     ┌──────────┐    ┌──────────┐    ┌──────────┐
     │ Peer A   │◄──►│ Peer B   │◄──►│ Peer C   │
     │(PeerJS)  │    │(PeerJS)  │    │(PeerJS)  │
     └──────────┘    └──────────┘    └──────────┘
          ▲                               ▲
          └───────── Direct P2P ──────────┘
```

### PeerJS ID 규칙
```typescript
// VoiceRoomProvider.tsx / VideoRoomProvider.tsx
const peerId = `${roomId}-${memberId}`
```

### VoiceRoomProvider 주요 기능
```typescript
interface VoiceRoomContextType {
  // 연결 상태
  isConnected: boolean
  isConnecting: boolean
  isAutoReconnecting: boolean
  
  // 스트림 관리
  localStream: MediaStream | null
  peers: Map<string, PeerConnection>
  
  // 제어
  connect: (roomId, memberId, isListenerOnly) => Promise<void>
  disconnect: (keepSession?) => void
  toggleMute: () => void
  applyForceMute: () => void
}
```

### VideoRoomProvider 추가 기능
```typescript
interface VideoRoomContextType extends VoiceRoomContextType {
  isVideoOff: boolean
  isScreenSharing: boolean
  facingMode: 'user' | 'environment'
  
  toggleVideo: () => void
  startScreenShare: () => Promise<void>
  switchCamera: () => Promise<void>
}
```

---

## 🔄 재연결 로직 (useOptimizedRealtime)

```typescript
// useOptimizedRealtime.ts
const config = {
  reconnectDelay: 1000,        // 초기 재연결 딜레이
  maxReconnectAttempts: 5,     // 최대 재연결 시도
  heartbeatInterval: 10000     // 연결 상태 체크 주기
}

// 지수 백오프 (Exponential Backoff)
const delay = Math.min(reconnectDelay * Math.pow(2, attempts), 30000)
```

### 연결 상태 타입
```typescript
type ConnectionStatus = 
  | 'connecting'    // 연결 시도 중
  | 'connected'     // 연결됨
  | 'disconnected'  // 연결 해제
  | 'error'         // 에러 발생
```

---

## 📨 실시간 채팅 흐름

### 메시지 전송 (Optimistic UI)
```
[사용자 입력]
     │
     ▼
[임시 메시지 표시]  ◄── tempMessageId 생성
     │
     ▼
[Supabase INSERT]   → stream_chats 테이블
     │
     ▼
[Realtime 수신]     ← 모든 참가자에게 전파
     │
     ▼
[임시 메시지 교체]  → 실제 메시지로 대체
```

### useStreamChat.ts 핵심 로직
```typescript
// 낙관적 UI 적용 시
const tempMessage: StreamChat = {
  id: `temp-${Date.now()}-${randomId}`,
  room_id: roomId,
  sender_id: user.id,
  content: messageContent,
  // ...
}

// 즉시 UI 업데이트
setChatData(roomId, [...currentChats, tempMessage])

// Supabase에 실제 저장
await supabase.from('stream_chats').insert({ ... })
```

---

## 🎁 후원 실시간 처리 (useStreamDonations)

### 이벤트 흐름
```
[후원 발생]
     │
     ▼
[stream_donations INSERT]
     │
     ▼
[Realtime 수신] ──► 모든 참가자 동시 수신
     │
     ├──► [이펙트 큐 추가]
     │          │
     │          ▼
     │    [순차 표시] (effectDuration: 5000ms)
     │
     └──► [랭킹 Query Invalidate]
```

### 후원 이펙트 타입
```typescript
interface DonationEffect {
  id: string
  donorName: string
  donorProfileImage: string | null
  recipientName: string
  amount: number
  heartImage: string
  message: string | null
  timestamp: number
}
```

---

## 🚫 모더레이션 (Ban/Kick/Mute)

### Broadcast 채널 사용
```typescript
// 강제 뮤트 발송 (호스트)
const channel = supabase.channel(`force-mute-broadcast-${roomId}`)
await channel.send({
  type: 'broadcast',
  event: 'force-mute',
  payload: { targetMemberId, reason }
})

// 강제 뮤트 수신 (시청자)
channel.on('broadcast', { event: 'force-mute' }, (payload) => {
  if (payload.targetMemberId === myId) {
    applyForceMute()
  }
})
```

### 제재 종류
```typescript
type BanType = 'room' | 'broadcast' | 'global'
type BanScope = 'room_only' | 'host_all_rooms' | 'platform'

const BAN_DURATIONS = [
  { label: '10분', minutes: 10 },
  { label: '1시간', minutes: 60 },
  { label: '1일', minutes: 1440 },
  { label: '영구', minutes: null },
]
```

---

## 🌍 전역 Realtime (GlobalRealtimeProvider)

### 구독 대상
1. **member_chats**: 1:1 채팅
2. **partner_requests**: 파트너 요청 상태

### 채팅 실시간 업데이트
```typescript
// INSERT 이벤트 처리
supabase.channel(`global-chat-${user.id}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'member_chats',
  }, async (payload) => {
    // 1. 기존 채팅방이면 메시지 업데이트
    // 2. 새 채팅방이면 상대방 정보 조회 후 추가
    // 3. unreadCount 증가
    // 4. 정렬 (안읽은 메시지 우선)
  })
  .subscribe()
```

---

## 🔧 세션 유지 (새로고침 대응)

### 세션 저장
```typescript
// VoiceRoomProvider.tsx / VideoRoomProvider.tsx
const VOICE_ROOM_SESSION_KEY = 'voice-room-session'

interface VoiceRoomSession {
  roomId: string
  memberId: string
  isListenerOnly: boolean
  timestamp: number
}

// 저장
sessionStorage.setItem(key, JSON.stringify(session))

// 복원 (마운트 시)
const session = loadSession()
if (session && Date.now() - session.timestamp < 5 * 60 * 1000) {
  // 5분 이내면 자동 재연결
  connect(session.roomId, session.memberId, session.isListenerOnly)
}
```

---

## 🧹 정리 (Cleanup)

### 채널 해제
```typescript
// 컴포넌트 언마운트 시
useEffect(() => {
  return () => {
    supabase.removeChannel(channel)
  }
}, [])
```

### PeerJS 연결 해제
```typescript
// VoiceRoomProvider.tsx
const disconnect = (keepSession = false) => {
  // 1. 모든 peer 연결 닫기
  peers.forEach(peer => peer.connection.close())
  
  // 2. 로컬 스트림 정리
  localStream?.getTracks().forEach(track => track.stop())
  
  // 3. Peer 인스턴스 destroy
  peerRef.current?.destroy()
  
  // 4. 세션 삭제 (keepSession이 false일 때)
  if (!keepSession) clearSession()
}
```

---

## 📊 데이터 흐름 요약

```
┌─────────────────────────────────────────────────────────────┐
│                        클라이언트                            │
├─────────────────────────────────────────────────────────────┤
│  Hooks                    Contexts                          │
│  ├─ useStreamChat         ├─ VoiceRoomProvider (PeerJS)     │
│  ├─ useStreamDonations    ├─ VideoRoomProvider (PeerJS)     │
│  ├─ useStreamModeration   ├─ GlobalRealtimeProvider         │
│  └─ useOptimizedRealtime  └─ Global*CallProvider            │
└─────────────────────────────────────────────────────────────┘
                              │ │
              ┌───────────────┘ └───────────────┐
              ▼                                 ▼
┌──────────────────────┐           ┌──────────────────────┐
│   Supabase Realtime  │           │      PeerJS Server   │
│   - postgres_changes │           │   (WebRTC Signaling) │
│   - broadcast        │           └──────────────────────┘
│   - presence         │                     │
└──────────────────────┘                     ▼
              │                    ┌──────────────────────┐
              ▼                    │    Direct P2P        │
┌──────────────────────┐           │  (Audio/Video Stream)│
│   PostgreSQL DB      │           └──────────────────────┘
│   - stream_rooms     │
│   - stream_chats     │
│   - stream_donations │
│   - stream_viewers   │
└──────────────────────┘
```

---

## 🔗 관련 문서

- [stream-summary.md](./stream-summary.md) - 스트림 기능 개요
- [PeerJS 공식 문서](https://peerjs.com/docs/)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
