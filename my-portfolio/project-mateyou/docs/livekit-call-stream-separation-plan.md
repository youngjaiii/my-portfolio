## LiveKit/통화/방송 분리 계획서 (TO-BE)

### 1) 목표(Non‑Negotiable)
- **(G1) 방송과 통화의 LiveKit 리소스를 분리**한다.
  - 최소 단위: **API 키/URL/토큰 발급 경계 분리**
  - 권장 단위: **LiveKit 서버(또는 LiveKit Cloud 프로젝트) 자체 분리**
- **(G2) 단말(클라이언트)에서 통화/방송 동시 실행로 인한 장치 충돌을 방지**한다.
  - “동시 사용 불가”가 제품 정책이라면, UI/상태로 명확히 차단/우선순위 처리.
- **(G3) 운영/장애 대응 시 ‘어떤 트래픽이 어디로 가는지’가 한눈에 보이게** 한다.
  - 모니터링/로그/알림의 단위를 “통화 LiveKit” vs “방송 LiveKit”으로 분리.

---

### 2) 현행(AS‑IS) 기준점
자세한 분석은 `docs/livekit-call-stream-analysis-report.md`를 따르며, 분리 작업의 기준점은 아래입니다.
- 방송(기본): HLS(OBS/RTMP) (`api-stream`, `HlsVideoPlayer`)
- 방송(옵션): 모바일 WebRTC 방송(LiveKit) (`/stream/video/webrtc-broadcast/$roomId`)
- 통화(루트): PeerJS 기반 통화 (`GlobalVoiceCallProvider`, `api-voice-call`)
- 통화(추가 존재): LiveKit+VoIP 기반 코드/함수 (`api-livekit`, `LiveKitVoiceCallProvider`) — 현 시점에서는 “혼재의 근원”

---

### 3) 분리 전략 후보(선택지)

#### 옵션 A (권장: 강한 분리) — LiveKit 서버/프로젝트 자체 분리
- **Broadcast LiveKit**: 방송(WebRTC 송출/시청, egress) 전용
- **Call LiveKit**: 통화(VoIP/CallKit) 전용
- 장점:
  - 트래픽 피크/장애가 서로 전파되지 않음
  - 설정(포트/코덱/egress 정책) 최적화가 용이
  - 보안(키/URL) 완전 분리
- 단점:
  - 운영 리소스(서버 2세트 or 프로젝트 2개) 증가

#### 옵션 B (중간) — 같은 LiveKit 서버를 쓰되 “키/룸 정책”만 분리
- LiveKit 키를 2개로 나누고, 토큰 발급에서 room prefix를 강제(예: `call_*`, `stream_*`)
- 장점: 인프라 변경이 적음
- 단점: 동일 서버 자원 공유(부하/장애 전파 가능), “완전 분리” 요구에는 부족

#### 옵션 C (기능 단순화) — 방송은 HLS만 유지, LiveKit은 통화(또는 반대)
- “모바일 WebRTC 방송 옵션”을 제거하거나, “LiveKit 통화”를 제거
- 장점: 복잡도 급감
- 단점: 모바일 송출/저지연 시청 등 제품 요구를 포기할 수 있음

> 본 계획서는 **옵션 A(강한 분리)** 를 기본 권장안으로 작성합니다. (옵션 B/C는 축약/대체 가능)

---

### 4) TO‑BE 아키텍처(권장)

#### 4.1 인프라(서버/도메인) 분리
- **Broadcast LiveKit**
  - 예: `wss://livekit-stream.mateyou.me`
  - 목적: 모바일 WebRTC 송출/저지연 시청 + (선택) LiveKit Egress → HLS
- **Call LiveKit**
  - 예: `wss://livekit-call.mateyou.me`
  - 목적: VoIP/CallKit, 1:1 통화 품질 최우선

#### 4.2 Edge Function 분리 (권장)
- `supabase/functions/api-livekit-call/*`
  - `voip-token` 저장
  - `room` 생성/통화 토큰 발급
  - (선택) 통화 종료/상태 콜백
- `supabase/functions/api-livekit-stream/*`
  - `token` (시청자/호스트 join 전용)
  - `broadcast/token` (호스트 송출 토큰 + egress 시작)
  - `broadcast/stop`, `broadcast/status/{roomId}`, `broadcast/hls/{roomId}`

#### 4.3 환경변수 분리
- Call 전용:
  - `LIVEKIT_CALL_API_KEY`
  - `LIVEKIT_CALL_API_SECRET`
  - `LIVEKIT_CALL_URL`
- Stream 전용:
  - `LIVEKIT_STREAM_API_KEY`
  - `LIVEKIT_STREAM_API_SECRET`
  - `LIVEKIT_STREAM_URL`

---

### 5) 단계별 실행 계획

#### Phase 0 — 기준 합의(필수, 짧게)
- **결정 0-1**: “통화”는 최종적으로 PeerJS를 유지할지, LiveKit로 이관할지.
  - (현재 루트는 PeerJS지만, LiveKit 통화 코드가 존재하므로 팀 합의 필요)
- **결정 0-2**: “모바일 WebRTC 방송 옵션”을 운영에서 유지할지(필요성/우선순위).

> Phase 0가 확정되면 아래 Phase 1~가 흔들리지 않습니다.

#### Phase 1 — 혼재 제거(코드 경계 정리)
- **1-1**: `api-livekit`의 책임을 분리(통화/방송 라우트 분할).
- **1-2**: `edgeApi.livekit.*`의 “존재하지만 백엔드에 없는 `/broadcast/*`”를 정리
  - 구현할 거면 `api-livekit-stream`로 이관해 실제 구현
  - 제거할 거면 프론트에서 호출 경로 제거(죽은 코드 제거)
- **1-3**: LiveKit 관련 플러그인/컨텍스트도 목적별로 분리
  - 방송 송출/시청용 모듈
  - 통화(VoIP/CallKit)용 모듈

#### Phase 2 — 인프라 분리(옵션 A 실행)
- **2-1**: Broadcast LiveKit 배포(이미 `mateyou-live-stream-server/infra/video-room`가 있다면 이를 “방송 전용”으로 확정)
- **2-2**: Call LiveKit 별도 배포(새 스택)
  - 별도 Redis/포트/도메인
  - 별도 키/시크릿(운영 시크릿으로만 주입)
- **2-3**: Edge Function env를 Call/Stream으로 분리 주입

#### Phase 3 — 단말 동시 실행 정책(UX/안정성)
- **3-1**: 방송(WebRTC 송출) 중 통화가 시작되면:
  - 정책 A: 통화 우선 → 방송 자동 종료/중지
  - 정책 B: 방송 우선 → 수신 통화 자동 거절/바쁜 상태
  - 정책 C: 사용자 선택(권장) → “방송 종료 후 통화받기”
- **3-2**: 통화 중 방송 시작 버튼을 명확히 비활성화 + 안내 문구 제공
- **3-3**: iOS의 AudioSession/CallKit 경합을 고려해 “전환 시 정리(cleanup)”를 강제

#### Phase 4 — 마이그레이션/롤백/정리
- **4-1**: 기능 플래그 도입(운영에서 점진 전환)
  - `LIVEKIT_STREAM_ENABLED`, `LIVEKIT_CALL_ENABLED` 같은 토글(서버/클라 모두)
- **4-2**: 관측 지표 분리
  - Call LiveKit: 연결 성공률, 통화 중断률, RTT, packet loss, MOS(가능하면)
  - Stream LiveKit: egress 성공률/지연, room 동시 접속수, CPU/대역폭
- **4-3**: 중복 구현 제거
  - “사용하지 않는 통화 구현(예: PeerJS vs LiveKit 중 하나)”을 최종적으로 정리
  - 문서/런북 업데이트

---

### 6) 완료 기준(Acceptance Criteria)
- **AC1**: 통화 LiveKit과 방송 LiveKit이 **서로 다른 URL/API Key**를 사용한다.
- **AC2**: `api-livekit-call`과 `api-livekit-stream`이 분리되어 배포/롤백이 독립적이다.
- **AC3**: 단말에서 방송(WebRTC) 중 통화/통화 중 방송이 “정책대로” 처리되어
  - 카메라/마이크 충돌로 인한 실패가 현저히 감소한다.
- **AC4**: 방송 트래픽 피크/egress 이슈가 통화 품질 지표에 영향을 주지 않는다(또는 영향이 통제 가능).

---

### 7) 단기 Quick Wins (바로 효과)
- **(Q1)** 방송(WebRTC) 시작 전에 “현재 통화 중인지”를 체크하고 즉시 차단/안내.
- **(Q2)** `api-livekit`의 토큰 발급을 room prefix 기준으로 제한(최소 보안/안정성).
- **(Q3)** `edgeApi.livekit` ↔ `api-livekit` 라우트 불일치를 정리(깨지는 경로 제거/구현).

