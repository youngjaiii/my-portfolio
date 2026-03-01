# HLS 방송 전환 가이드

> 기존 PeerJS(WebRTC) 방송을 HLS 스트리밍으로 전환하는 가이드

---

## 📋 목차
1. [개요](#개요)
2. [아키텍처 비교](#아키텍처-비교)
3. [설치 및 설정](#설치-및-설정)
4. [스트림 키 관리](#스트림-키-관리)
5. [시청자 UI 전환](#시청자-ui-전환)
6. [호스트 송출 방법](#호스트-송출-방법)
7. [체크리스트](#체크리스트)

---

## 📝 개요

### 현재: PeerJS (WebRTC Mesh)
- 장점: 저지연 (1-2초), P2P 직접 연결
- 단점: 확장성 한계 (10-15명), 브라우저 호환성 문제, 모바일 불안정

### 변경: HLS (HTTP Live Streaming)
- 장점: 무제한 시청자 확장, CDN 캐싱, 안정적인 재생
- 단점: 지연 시간 (4-10초), 단방향 스트리밍

---

## 🏗️ 아키텍처 비교

### 기존 (PeerJS)
```
[호스트 브라우저] ←→ [PeerJS 서버] ←→ [시청자 브라우저]
                    WebRTC P2P 연결
```

### 신규 (HLS)
```
[호스트]                    [서버]                    [시청자]
   │                          │                          │
   │  OBS/PRISM RTMP          │                          │
   │  ────────────────────►   │                          │
   │  rtmp://host:1935/live   │                          │
   │  /스트림키               │                          │
   │                          │                          │
   │                    ┌─────┴─────┐                    │
   │                    │  Nginx    │                    │
   │                    │  RTMP     │                    │
   │                    └─────┬─────┘                    │
   │                          │                          │
   │                    ┌─────┴─────┐                    │
   │                    │  FFmpeg   │                    │
   │                    │  HLS 변환 │                    │
   │                    └─────┬─────┘                    │
   │                          │                          │
   │                    ┌─────┴─────┐                    │
   │                    │  S3 +     │                    │
   │                    │CloudFront │                    │
   │                    └─────┬─────┘                    │
   │                          │                          │
   │                          │  ◄────────────────────   │
   │                          │  HLS 재생                │
   │                          │  https://cdn/hls/키/     │
   │                          │  index.m3u8              │
```

---

## ⚙️ 설치 및 설정

### 1. 패키지 설치 (완료)
```bash
pnpm add hls.js
```

### 2. 환경 변수 설정
```env
# .env.local
VITE_HLS_BASE_URL=https://stream.mateyou.me
VITE_CLOUDFRONT_DOMAIN=dxxxxx.cloudfront.net
VITE_USE_CLOUDFRONT=true
```

### 3. DB 마이그레이션
```bash
# stream_keys 테이블 생성
psql -f documents/stream_keys_migration.sql
```

### 4. Nginx 설정 변경
```bash
# 인증 기능이 포함된 설정 사용
cp nginx-with-auth.conf nginx.conf
```

---

## 🔑 스트림 키 관리

### API 엔드포인트

| 엔드포인트 | 메소드 | 설명 |
|-----------|--------|------|
| `/api-stream/keys/generate` | POST | 스트림 키 생성 |
| `/api-stream/keys/refresh` | POST | 스트림 키 재발급 |
| `/api-stream/keys/:partnerId` | GET | 스트림 키 조회 |
| `/api-stream/rtmp/auth` | POST | RTMP 인증 (Nginx용) |

### 사용 예시

```typescript
import { useStreamKey, useCreateStreamKey } from '@/hooks/useHlsStream'

function StreamKeySettings({ partnerId }: { partnerId: string }) {
  const { data: keyData } = useStreamKey(partnerId)
  const createKey = useCreateStreamKey()
  
  return (
    <div>
      {keyData?.stream_key ? (
        <div>
          <p>스트림 키: {keyData.stream_key}</p>
          <p>RTMP URL: rtmp://stream.mateyou.me:1935/live</p>
        </div>
      ) : (
        <button onClick={() => createKey.mutate(partnerId)}>
          스트림 키 생성
        </button>
      )}
    </div>
  )
}
```

---

## 📺 시청자 UI 전환

### 기존 코드 (`$roomId.tsx`)
```tsx
// VideoPlayer는 WebRTC 스트림을 srcObject로 받음
<VideoPlayer
  videoRef={remoteVideoRef}
  roomTitle={room.title}
  ...
/>
```

### HLS 전환 코드
```tsx
import { HlsVideoPlayer } from '@/components/features/stream/HlsVideoPlayer'
import { useRoomHlsUrl } from '@/hooks/useHlsStream'

function VideoRoomPage() {
  const { roomId } = Route.useParams()
  const { data: hlsUrl, isLoading } = useRoomHlsUrl(roomId)
  
  // 방송 타입에 따라 분기
  if (room.broadcast_type === 'hls') {
    return (
      <HlsVideoPlayer
        hlsUrl={hlsUrl}
        roomTitle={room.title}
        hostName={room.host_partner?.member?.name}
        hostInitial={room.host_partner?.member?.name?.charAt(0)}
        isConnecting={isLoading}
        lowLatency={true}
      />
    )
  }
  
  // 기존 WebRTC 방송
  return (
    <VideoPlayer
      videoRef={remoteVideoRef}
      ...
    />
  )
}
```

### HlsVideoPlayer 컴포넌트 기능
- ✅ 자동 재연결 (네트워크 오류 시)
- ✅ 라이브 엣지 동기화 (지연 5초 초과 시 자동 점프)
- ✅ 저지연 모드 지원
- ✅ 버퍼링 상태 표시
- ✅ 대기 화면 (기존 VideoPlayer와 동일)

---

## 🎥 호스트 송출 방법

### OBS Studio 설정
1. 설정 → 방송
2. 서비스: **사용자 지정...**
3. 서버: `rtmp://stream.mateyou.me:1935/live`
4. 스트림 키: 발급받은 스트림 키 입력

### PRISM Live Studio 설정
1. 방송 설정 → 커스텀 RTMP
2. URL: `rtmp://stream.mateyou.me:1935/live`
3. 스트림 키: 발급받은 스트림 키 입력

### 권장 송출 설정
| 설정 | 권장값 |
|------|--------|
| 해상도 | 1280x720 (720p) |
| 비트레이트 | 2500-4000 kbps |
| 프레임레이트 | 30fps |
| 키프레임 간격 | 2초 |
| 인코더 | x264 또는 NVENC |
| 오디오 비트레이트 | 128-160 kbps |

---

## 🔄 하이브리드 모드 (선택사항)

기존 WebRTC와 HLS를 동시에 지원하려면:

```tsx
// stream_rooms.broadcast_type 필드 사용
// 'webrtc' | 'hls' | 'hybrid'

function VideoRoomPage() {
  const room = useRoom(roomId)
  
  // 하이브리드 모드: 호스트는 WebRTC로 채팅 참여, 시청자는 HLS로 시청
  if (room.broadcast_type === 'hybrid') {
    if (isHost) {
      // 호스트: 기존 WebRTC Provider 사용
      return <VideoRoomProvider>...</VideoRoomProvider>
    } else {
      // 시청자: HLS 플레이어 사용
      return <HlsVideoPlayer hlsUrl={hlsUrl} />
    }
  }
}
```

---

## ✅ 체크리스트

### 인프라
- [ ] Nginx RTMP 서버 설정
- [ ] FFmpeg 트랜스코딩 설정
- [ ] S3 버킷 생성 (HLS 세그먼트 저장)
- [ ] CloudFront 배포 설정
- [ ] HTTPS/SSL 인증서 적용

### 백엔드
- [x] `stream_keys` 테이블 생성
- [x] 스트림 키 생성/조회 API
- [x] RTMP 인증 엔드포인트
- [x] HLS URL 조회 API
- [ ] `stream_rooms.broadcast_type` 컬럼 추가

### 프론트엔드
- [x] hls.js 패키지 설치
- [x] `HlsVideoPlayer` 컴포넌트 생성
- [x] `useHlsStream` 훅 생성
- [ ] 시청자 페이지에서 HLS 플레이어 적용
- [ ] 스트림 키 관리 UI 추가

### 테스트
- [ ] OBS → RTMP → HLS 송출 테스트
- [ ] 시청자 재생 테스트
- [ ] 모바일 Safari/Chrome 테스트
- [ ] 재연결/복구 테스트
- [ ] 지연 시간 측정

---

## 📂 관련 파일

### 새로 생성된 파일
- `src/components/features/stream/HlsVideoPlayer.tsx` - HLS 플레이어 컴포넌트
- `src/hooks/useHlsStream.ts` - HLS 스트림 관리 훅
- `documents/stream_keys_migration.sql` - 스트림 키 테이블 마이그레이션

### 수정된 파일
- `supabase/functions/api-stream/index.ts` - 스트림 키 API 추가

### 서버 설정
- `mateyou-live-stream-server/infra/video-room/nginx/nginx-with-auth.conf` - 인증 포함 Nginx 설정
- `mateyou-live-stream-server/infra/video-room/nginx/scripts/auth.sh` - 인증 스크립트
