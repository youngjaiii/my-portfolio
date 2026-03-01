## LiveKit/통화/방송 혼재 분석 보고서 (AS-IS)

### 1) 작성 배경 (문제 인식)
- **요청 요지**: “라이브 방송에서 LiveKit이 전화통화와 같이 있으면 안 되는데, 한 번에 같이 사용되는 느낌”이 있으며, 이를 **분석**하고 **분리 계획**이 필요함.
- **핵심 우려**:
  - **인프라/자원 관점**: 방송 트래픽(고부하)과 통화 트래픽(저지연/고신뢰)이 **같은 LiveKit 자원(서버/프로젝트/키)** 을 공유하면 품질·안정성 리스크가 커짐.
  - **클라이언트(단말) 관점**: 방송(WebRTC 송출/시청)과 통화가 동시에 기동되면 **카메라/마이크(AudioSession 포함)** 를 동시에 점유하려 하면서 “Device in use”류 문제가 발생할 수 있음.

---

### 2) 결론 요약 (한 줄)
현재 코드/인프라에는 **(A) HLS(OBS/RTMP) 기반 방송**, **(B) LiveKit 기반 WebRTC 모바일 방송 옵션**, **(C) PeerJS 기반 전화통화**, 그리고 **(D) LiveKit 기반 통화(VoIP/CallKit)로 보이는 코드/Edge Function** 이 함께 존재하여, **“LiveKit이 통화와 방송에 동시에 걸려있는 것처럼 보이는 구조적 혼재”** 가 발생하고 있습니다.

---

### 3) AS-IS 구성요소 맵

#### 3.1 방송(영상) 기본 경로: HLS (RTMP → HLS)
- **주요 UI 경로**: `src/routes/stream/video/$roomId.tsx`
  - 영상 재생은 `HlsVideoPlayer` + `useRoomHlsUrl` 로 구성.
- **리허설/방송 시작**: `src/routes/stream/video/hls-rehearsal.$roomId.tsx`
  - OBS 연결 확인(파트너 ID 기반 `/live/{partnerId}/index.m3u8` 체크) 후 `edgeApi.stream.startBroadcast()`로 상태 전환.
- **서버/인프라**:
  - `mateyou-live-stream-server/infra/video-room/docker-compose.yml`에 **Nginx RTMP + FFmpeg(HLS) + S3 Sync** 포함.
  - `mateyou-live-stream-server/docs/video-room-infra-docker-compose.md`에 HLS 파이프라인/운영 포인트 정리.
- **특징**:
  - 방송 시청은 HTTP 기반(HLS)이라 확장성에 유리.
  - “전화통화”와 직접적으로 같은 미디어 서버(LiveKit)를 쓸 필요가 없음(기본 경로 기준).

#### 3.2 방송(영상) 추가 경로: WebRTC 모바일 방송(옵션) = LiveKit 사용
- **호스트 송출 경로**: `src/routes/stream/video/webrtc-broadcast.$roomId.tsx`
  - `WebRTCBroadcast` 컴포넌트를 사용해 모바일 웹에서 카메라/마이크로 직접 송출.
- **LiveKit 연동 훅/플러그인**:
  - `src/hooks/useLiveKitBroadcast.ts`: 토큰 요청 후 LiveKit Room 연결 + 트랙 publish.
  - `src/plugins/LiveKitWeb.ts`: `livekit-client` 기반 송출(로컬 오디오/비디오 트랙 생성, publish).
- **토큰/제어 API(프론트 기준)**:
  - `src/lib/edgeApi.ts`의 `edgeApi.livekit.*`가 `api-livekit` Edge Function으로 요청을 보냄:
    - `/token`
    - `/broadcast/token`, `/broadcast/stop`, `/broadcast/status/{roomId}`, `/broadcast/hls/{roomId}`
- **중요 발견(구현 불일치)**:
  - `supabase/functions/api-livekit/index.ts`(현재 파일 기준)에는 **`/broadcast/*` 라우트 구현이 확인되지 않음**.
  - 즉, WebRTC 방송 경로는 “의도는 LiveKit(+Egress) 기반”인데, **서버 구현/라우팅이 미완성이거나 다른 방식으로 우회 동작 중일 가능성**이 있습니다.

#### 3.3 방송 시청 경로(추가 옵션): LiveKit WebRTC Viewer
- **시청 컴포넌트**: `src/components/features/stream/WebRTCViewer.tsx`
  - `edgeApi.livekit.getToken()`으로 토큰을 받아 LiveKit Room에 직접 연결해 스트림을 시청(저지연 목적).
- **기본 시청 경로(HLS)와 병존**하므로, 서비스 정책/운영 기준이 없으면 “무슨 방송이 어느 서버로 가는지”가 혼란스러워질 수 있습니다.

#### 3.4 전화통화(현재 앱 루트 기준): PeerJS 기반 (LiveKit 아님)
- **루트 Provider 구성**: `src/routes/__root.tsx`
  - `GlobalVoiceCallProvider`, `GlobalVideoCallProvider`가 사용 중이며 둘 다 **PeerJS 기반 통화**입니다.
- **통화 Edge Function**: `supabase/functions/api-voice-call/index.ts`
  - `call_rooms`, `call_participants` 기반으로 통화방 생성/입장/종료를 관리.
- **푸시 알림**: `supabase/functions/notify-call/index.ts`
  - native/web push로 “통화 왔어요” 알림 전송(VoIP PushKit과는 별개).

#### 3.5 전화통화(추가로 존재): LiveKit + VoIP(푸시) 기반 코드/Edge Function
- **LiveKit 통화용 Edge Function(추정/목적이 명확)**: `supabase/functions/api-livekit/index.ts`
  - `voip-token` 저장, APNs VoIP push 전송, `call_rooms` 기록, `call_...` 룸명 생성, LiveKit JWT 발급 로직 포함.
- **LiveKit 통화 Provider(현재 루트엔 미적용)**: `src/contexts/LiveKitVoiceCallProvider.tsx`
  - iOS CallKit/VoIP 이벤트를 가정한 로직과 LiveKit 연결 코드가 포함되어 있음.
- **정리**:
  - 현재 “실사용(루트)”은 PeerJS 통화지만,
  - 코드베이스에는 “LiveKit 통화”도 별도로 존재하여 **개발/운영/설정이 섞여 보이게 만드는 요인**이 됩니다.

---

### 4) “같이 사용되는 느낌”의 원인 분석 (가능성이 높은 것부터)

#### 4.1 LiveKit이 통화/방송 양쪽에 ‘역할’로 존재
- 방송(모바일 WebRTC 옵션)에서 LiveKit을 사용하고,
- 통화(VoIP/CallKit)도 LiveKit 기반 구현이 같은 저장소에 존재하며,
- LiveKit 관련 키/URL/토큰 발급이 **`api-livekit`로 집중**되어 있어, 논리적 경계가 흐립니다.

#### 4.2 단말 리소스 충돌 (카메라/마이크/Audio Session)
- WebRTC 방송 송출은 필연적으로 카메라/마이크를 점유합니다.
- 통화 역시 마이크(영상통화는 카메라 포함)를 점유합니다.
- 동시에 실행되면 브라우저/OS에 따라 아래가 발생할 수 있습니다:
  - 카메라/마이크 “Device in use”
  - iOS에서 AudioSession/CallKit 경합
  - 오디오 출력 장치(스피커/이어피스) 모드 꼬임

#### 4.3 운영/배포 측면 결합(Blast Radius 확대)
- 방송 관련 변경(예: egress, token grant)과 통화 관련 변경(예: VoIP push)이 같은 함수/같은 LiveKit 인프라에 섞이면,
  - 배포 영향 범위가 커지고
  - 장애 원인 파악이 어려워지며
  - 트래픽 피크 시 통화 품질이 영향을 받을 수 있습니다.

---

### 5) 현재 상태에서의 핵심 리스크 체크리스트
- **보안/권한**: LiveKit 토큰 발급이 “어떤 roomName이든 발급 가능한 형태”이면(현재 `api-livekit`의 `/token` 형태) 룸 접근 제어를 강하게 하기 어렵습니다.
- **구현 불일치 리스크**: `edgeApi.livekit`의 `/broadcast/*`가 백엔드에 없으면, 모바일 WebRTC 방송 기능은 운영에서 깨지거나 예기치 않은 fallback 동작이 발생합니다.
- **이중 구현 리스크(통화)**: PeerJS 통화와 LiveKit 통화가 동시에 존재하면, 설정/모니터링/장애 대응이 2배로 복잡해집니다.

---

### 6) 권장 방향(요약)
- **방송 LiveKit**과 **통화 LiveKit**을 같은 인프라/키/코드 경계에 두지 말고,
  - 최소: **Edge Function 분리 + 키/URL 분리**
  - 이상: **LiveKit 서버(또는 LiveKit Cloud 프로젝트) 자체 분리**
- 동시에, 단말에서는 **통화 ↔ 방송 동시 점유를 정책적으로 차단/우선순위 처리**가 필요합니다.

> 상세 실행 계획은 `docs/livekit-call-stream-separation-plan.md`에 정리합니다.

