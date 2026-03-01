# 시청자 Heartbeat 및 Realtime 채널 통합 기획서

> **Version**: 1.0  
> **작성일**: 2025-12-23  
> **관련 파일**: `stream_schema_v2.sql`, `cron-stream-cleanup`

---

## 📋 목차

1. [배경 및 목표](#배경-및-목표)
2. [시청자 Heartbeat 시스템](#시청자-heartbeat-시스템)
3. [Realtime 채널 통합](#realtime-채널-통합)
4. [구현 계획](#구현-계획)
5. [API 명세](#api-명세)

---

## 🎯 배경 및 목표

### 현재 문제점

#### 문제 1: 유령 시청자 (Ghost Viewers)
```
1. 사용자가 방송을 시청 중
2. 갑자기 앱 종료 / 배터리 방전 / 네트워크 끊김
3. left_at이 설정되지 않아 stream_viewers에 계속 남아있음
4. viewer_count가 실제보다 높게 표시됨
5. 시청자 목록에 "유령" 사용자가 남아있음
```

#### 문제 2: 과도한 Realtime 채널 수
```
현재 하나의 방에서 사용하는 채널:
├── stream-donations-{roomId}      # 후원 이벤트
├── force-mute-broadcast-{roomId}  # 강제 뮤트
├── ban-detection-{roomId}         # 차단 감지
├── voice-peers-{roomId}           # P2P 시그널링
├── pinned-chat-{roomId}           # 고정 채팅 (선택적)
└── ... 기타 채널

= 방 1개당 5개 이상의 채널
= 서버 부담 증가, 비용 증가
```

### 목표

| 목표 | 설명 |
|------|------|
| 🎯 시청자 자동 정리 | 2분간 Heartbeat 없는 시청자 자동 퇴장 처리 |
| 🎯 정확한 시청자 수 | 실시간으로 정확한 viewer_count 유지 |
| 🎯 채널 통합 | 5개+ 채널 → 1개 통합 채널로 비용/복잡도 감소 |

---

## 💓 시청자 Heartbeat 시스템

### 1. 개요

시청자도 호스트처럼 주기적으로 "나 살아있어요" 신호를 보내는 시스템입니다.

```
┌─────────────────────────────────────────────────────────┐
│                    시청자 Heartbeat 흐름                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   [시청자 입장]                                          │
│        │                                                │
│        ▼                                                │
│   stream_viewers INSERT                                 │
│   (last_heartbeat = now())                              │
│        │                                                │
│        ▼                                                │
│   ┌────────────────────┐                                │
│   │  30초마다 반복     │◄─────────────────┐             │
│   │  Heartbeat 전송    │                  │             │
│   └────────┬───────────┘                  │             │
│            │                               │             │
│            ▼                               │             │
│   UPDATE last_heartbeat = now()           │             │
│            │                               │             │
│            └───────────────────────────────┘             │
│                                                         │
│   [Cron Job - 매분 실행]                                 │
│        │                                                │
│        ▼                                                │
│   last_heartbeat < now() - 2분 인 시청자 찾기            │
│        │                                                │
│        ▼                                                │
│   UPDATE left_at = now() (자동 퇴장 처리)                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2. DB 스키마 변경

#### stream_viewers 테이블에 컬럼 추가

```sql
-- 기존 테이블
CREATE TABLE stream_viewers (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL,
    member_id UUID NOT NULL,
    joined_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    watch_duration INTERVAL GENERATED ALWAYS AS (left_at - joined_at) STORED,
    -- ✅ 새로 추가
    last_heartbeat TIMESTAMPTZ DEFAULT now()  -- 마지막 Heartbeat 시간
);

-- 인덱스 추가 (Cron에서 오래된 시청자 조회용)
CREATE INDEX idx_stream_viewers_heartbeat 
ON stream_viewers (last_heartbeat)
WHERE left_at IS NULL;
```

### 3. Heartbeat 주기 및 타임아웃

| 항목 | 값 | 설명 |
|------|-----|------|
| **Heartbeat 주기** | 30초 | 시청자가 30초마다 신호 전송 |
| **타임아웃** | 2분 | 2분간 신호 없으면 퇴장 처리 |
| **Cron 실행 주기** | 1분 | 매분 오래된 시청자 정리 |

**왜 이 값인가?**
- 30초: 너무 짧으면 서버 부담, 너무 길면 감지 지연
- 2분: 일시적 네트워크 끊김 복구 시간 고려
- 기존 호스트 Heartbeat와 동일한 기준 적용

### 4. API 설계

#### Edge Function: `api-stream/heartbeat/viewer`

```typescript
// POST /api-stream/heartbeat/viewer
// Body: { room_id: string }
// Response: { success: true, timestamp: string }

// 시청자 Heartbeat 업데이트
await supabase
  .from('stream_viewers')
  .update({ last_heartbeat: new Date().toISOString() })
  .eq('room_id', roomId)
  .eq('member_id', userId)
  .is('left_at', null)
```

### 5. 프론트엔드 Hook

```typescript
// useViewerHeartbeat.ts
export function useViewerHeartbeat({ 
  roomId, 
  isViewer,  // 시청자인지 여부
  isLive     // 방이 라이브 상태인지
}: UseViewerHeartbeatOptions) {
  useEffect(() => {
    const shouldSend = !!roomId && isViewer && isLive
    
    if (shouldSend) {
      // 즉시 첫 Heartbeat 전송
      sendHeartbeat()
      
      // 30초마다 Heartbeat 전송
      const interval = setInterval(sendHeartbeat, 30000)
      return () => clearInterval(interval)
    }
  }, [roomId, isViewer, isLive])
}
```

### 6. Cron Job 수정

```typescript
// cron-stream-cleanup/index.ts

// 기존: 호스트 Heartbeat만 체크
// 수정: 시청자 Heartbeat도 체크

// 1. 오래된 호스트 방 정리 (기존 로직)
// 2. 오래된 시청자 정리 (새로 추가)
const { data: staleViewers } = await supabase
  .from('stream_viewers')
  .select('id, room_id, member_id')
  .lt('last_heartbeat', timeoutThreshold.toISOString())
  .is('left_at', null)

for (const viewer of staleViewers) {
  await supabase
    .from('stream_viewers')
    .update({ left_at: now.toISOString() })
    .eq('id', viewer.id)
}
```

---

## 📡 Realtime 채널 통합

### 1. 현재 채널 구조 분석

| 채널 이름 | 용도 | 타입 |
|-----------|------|------|
| `stream-donations-{roomId}` | 후원 이벤트 | postgres_changes |
| `force-mute-broadcast-{roomId}` | 강제 뮤트 알림 | broadcast |
| `ban-detection-{roomId}-{memberId}` | 차단 감지 | postgres_changes |
| `voice-peers-{roomId}` | P2P 시그널링 | broadcast |
| `video-peers-{roomId}` | P2P 시그널링 | broadcast |
| `pinned-chat-{roomId}` | 고정 채팅 | broadcast |

### 2. 통합 채널 설계

```typescript
// 기존: 채널 5개+
const donationChannel = supabase.channel(`stream-donations-${roomId}`)
const muteChannel = supabase.channel(`force-mute-broadcast-${roomId}`)
const banChannel = supabase.channel(`ban-detection-${roomId}-${memberId}`)
const peersChannel = supabase.channel(`voice-peers-${roomId}`)
// ...

// 통합: 채널 1개 (메인 스트림 채널)
const streamChannel = supabase.channel(`stream-unified-${roomId}`)
```

### 3. 통합 채널 이벤트 타입

```typescript
// 통합 채널에서 사용할 이벤트 타입
type StreamEventType = 
  // 후원 관련
  | 'donation:new'           // 새 후원
  | 'donation:status'        // 후원 상태 변경 (playing/completed/skipped)
  
  // 모더레이션
  | 'moderation:force-mute'  // 강제 뮤트
  | 'moderation:force-unmute'// 강제 뮤트 해제
  | 'moderation:kick'        // 강퇴
  | 'moderation:ban'         // 차단
  
  // P2P 시그널링 (PeerJS)
  | 'peer:join'              // 피어 입장
  | 'peer:leave'             // 피어 퇴장
  | 'peer:offer'             // WebRTC Offer
  | 'peer:answer'            // WebRTC Answer
  | 'peer:ice-candidate'     // ICE Candidate
  
  // 채팅 관련
  | 'chat:pin'               // 채팅 고정
  | 'chat:unpin'             // 채팅 고정 해제
  
  // 방 상태
  | 'room:host-change'       // 호스트 변경 (합방 등)
  | 'room:end'               // 방송 종료
```

### 4. 통합 채널 구조

```typescript
// useUnifiedStreamChannel.ts
export function useUnifiedStreamChannel(roomId: string) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const channel = supabase.channel(`stream-unified-${roomId}`, {
      config: {
        broadcast: { self: true },  // 자신에게도 브로드캐스트
      }
    })

    // 1. Broadcast 이벤트 (DB 거치지 않는 실시간 메시지)
    channel.on('broadcast', { event: '*' }, (payload) => {
      const { type, data } = payload.payload as { type: StreamEventType; data: unknown }
      
      switch (type) {
        case 'moderation:force-mute':
          handleForceMute(data)
          break
        case 'peer:join':
          handlePeerJoin(data)
          break
        case 'chat:pin':
          handleChatPin(data)
          break
        // ... 기타 이벤트
      }
    })

    // 2. Postgres Changes (DB 변경 감지)
    channel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'stream_donations',
      filter: `room_id=eq.${roomId}`,
    }, handleNewDonation)

    channel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'stream_chat_bans',
      filter: `room_id=eq.${roomId}`,
    }, handleNewBan)

    // 3. Presence (온라인 상태)
    channel.on('presence', { event: 'sync' }, handlePresenceSync)

    channel.subscribe((status) => {
      setIsConnected(status === 'SUBSCRIBED')
    })

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId])

  // 메시지 전송 함수
  const broadcast = (type: StreamEventType, data: unknown) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'stream-event',
      payload: { type, data }
    })
  }

  return { isConnected, broadcast }
}
```

### 5. 마이그레이션 계획

기존 코드와의 호환성을 위해 단계적으로 마이그레이션합니다.

```
Phase 1: 통합 채널 추가 (기존 채널 유지)
├── useUnifiedStreamChannel 구현
├── 새로운 이벤트는 통합 채널로 전송
└── 기존 채널도 계속 동작

Phase 2: 점진적 전환
├── 각 기능별로 통합 채널로 전환
├── 테스트 및 검증
└── 문제 없으면 기존 채널 제거

Phase 3: 기존 채널 제거
├── 미사용 채널 정리
└── 코드 정리
```

---

## 📊 구현 계획

### Phase 1: DB 스키마 + 시청자 Heartbeat (우선)

| 작업 | 예상 소요 |
|------|----------|
| stream_viewers에 last_heartbeat 컬럼 추가 | 10분 |
| 마이그레이션 SQL 작성 | 20분 |
| useViewerHeartbeat Hook 구현 | 30분 |
| Edge Function 수정 (heartbeat/viewer) | 20분 |
| cron-stream-cleanup 수정 | 20분 |
| **소계** | **~1시간 40분** |

### Phase 2: Realtime 채널 통합

| 작업 | 예상 소요 |
|------|----------|
| useUnifiedStreamChannel Hook 구현 | 1시간 |
| 기존 Hook들 리팩토링 | 2시간 |
| 테스트 및 검증 | 1시간 |
| **소계** | **~4시간** |

---

## 📝 API 명세

### 시청자 Heartbeat API

```
POST /functions/v1/api-stream
Body: {
  "action": "viewer-heartbeat",
  "room_id": "uuid"
}

Response (성공):
{
  "success": true,
  "data": {
    "timestamp": "2025-12-23T10:00:00Z"
  }
}

Response (실패):
{
  "success": false,
  "error": {
    "code": "NOT_IN_ROOM",
    "message": "해당 방에 입장하지 않았습니다"
  }
}
```

### 통합 채널 이벤트 페이로드

```typescript
// 강제 뮤트
{
  type: 'moderation:force-mute',
  data: {
    targetMemberId: 'uuid',
    mutedBy: 'uuid',
    reason?: string
  }
}

// 새 후원 (DB 트리거)
{
  type: 'donation:new',
  data: {
    id: 123,
    donorId: 'uuid',
    donorName: '홍길동',
    amount: 5000,
    message: '파이팅!',
    heartImage: '/icon/heart.png'
  }
}

// P2P 시그널링
{
  type: 'peer:offer',
  data: {
    fromPeerId: 'roomId-memberId',
    toPeerId: 'roomId-memberId2',
    sdp: '...'
  }
}
```

---

## ✅ 체크리스트

### Phase 1: 시청자 Heartbeat
- [ ] `stream_viewers.last_heartbeat` 컬럼 추가
- [ ] 인덱스 생성 (`idx_stream_viewers_heartbeat`)
- [ ] `useViewerHeartbeat` Hook 구현
- [ ] Edge Function `viewer-heartbeat` 액션 추가
- [ ] `cron-stream-cleanup` 시청자 정리 로직 추가
- [ ] VoiceRoomPage/VideoRoomPage에 Hook 적용

### Phase 2: Realtime 채널 통합
- [ ] `useUnifiedStreamChannel` Hook 구현
- [ ] 이벤트 타입 정의
- [ ] 기존 채널 → 통합 채널 마이그레이션
- [ ] 테스트 및 검증
- [ ] 기존 채널 정리

---

## 🔗 관련 문서

- [stream_schema_v2.sql](./stream_schema_v2.sql) - DB 스키마
- [stream-realtime-architecture.md](../docs/stream-realtime-architecture.md) - 실시간 아키텍처
- [stream-flow-analysis.md](../docs/stream-flow-analysis.md) - 방송 흐름 분석

