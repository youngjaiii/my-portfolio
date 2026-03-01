# Google Play 개발자 프로그램 – 사용자 데이터, 서드파티 코드 및 SDK 정책 준수 문서

## 1. 사용자 데이터 정책 준수 개요

본 앱(Mate You)은 Google Play 개발자 프로그램 정책을 준수하며, 필요한 경우에만 사용자 데이터를 수집합니다. 앱에 포함된 모든 서드파티 코드와 SDK는 정책 준수 여부를 검토하였으며, 데이터 수집 목적과 범위를 최소화하고 있습니다.

---

## 2. 앱에서 사용하는 SDK 및 사용 이유

### 2.1 사용자 데이터를 처리할 수 있는 SDK (핵심)

| SDK | 버전 | 사용 목적 | 데이터 처리 |
|-----|------|-----------|-------------|
| **Firebase Cloud Messaging** | 33.4.0 (BOM) | 푸시 알림 발송 | FCM 토큰, 디바이스 식별자 |
| **Supabase** | 2.75.x | 백엔드·DB·인증 | 계정, 채팅, 주문 등 앱 핵심 데이터 |
| **Toss Payments SDK** | 2.4.x | 결제 처리 | 결제 정보(카드번호 등은 PG사 직접 처리) |
| **LiveKit** | 2.17.x / Android 2.5.0 | 음성·영상 통화 | 통화 오디오·비디오 스트림 |
| **Capacitor Firebase Messaging** | 7.4.x | FCM 연동 (네이티브) | 푸시 토큰 및 메시지 수신 |
| **Capacitor Apple Sign In** | 7.1.x | Apple 로그인 | 사용자 식별자, 이메일(선택) |
| **Capacitor Camera** | 7.0.x | 사진 촬영/선택 | 카메라·갤러리 접근 |
| **Capacitor Device** | 7.0.x | 디바이스 정보 | 모델명, OS 버전 등 |
| **Capacitor Push Notifications** | 7.0.x | 푸시 알림 권한·토큰 | 알림 토큰, 권한 상태 |
| **Capacitor Community Media** | 8.0.x | 미디어 선택 | 사진·동영상 선택 |
| **Leaflet / react-leaflet** | 1.9.x / 5.0.x | 지도 표시 | 지도·위치 데이터(사용 시) |

### 2.2 UI·유틸리티 SDK (사용자 데이터 직접 수집 없음)

| SDK | 버전 | 사용 목적 |
|-----|------|-----------|
| **React** | 19.x | UI 프레임워크 |
| **TanStack React Query** | 5.x | 서버 상태 관리 |
| **TanStack React Router** | 1.x | 라우팅 |
| **Tailwind CSS** | 4.x | 스타일링 |
| **Ant Design** | 5.x | UI 컴포넌트 |
| **Radix UI** | 2.x | UI 컴포넌트 |
| **Framer Motion** | 12.x | 애니메이션 |
| **date-fns** | 4.x | 날짜 처리 |
| **axios** | 1.x | HTTP 클라이언트 |
| **Zustand** | 5.x | 클라이언트 상태 관리 |
| **hls.js** | 1.6.x | HLS 동영상 스트리밍 |
| **pdfjs-dist** | 5.4.x | PDF 뷰어 |
| **PeerJS** | 1.5.x | P2P 연결 |
| **idb-keyval** | 6.x | 로컬 스토리지 |
| **crypto-js** | 4.x | 암호화 |
| **@ffmpeg/ffmpeg** | 0.12.x | 미디어 변환 |
| **dnd-kit** | 6.x | 드래그 앤 드롭 |
| **Swiper** | 12.x | 캐러셀 |
| **Lucide React** | 0.555.x | 아이콘 |
| **web-vitals** | 5.x | Core Web Vitals 측정 |

### 2.3 네이티브 플랫폼 SDK

| SDK | 플랫폼 | 사용 목적 |
|-----|--------|-----------|
| **Capacitor** | Android / iOS | 하이브리드 앱 래퍼, 네이티브 기능 연동 |
| **Google Services** | Android | Firebase 연동 |
| **Firebase Messaging** | Android / iOS | FCM |
| **LiveKit Client** | Android / iOS | 실시간 음성·영상 통화 |

---

## 3. 서드파티 코드·SDK의 Google 정책 준수 확인 방법

### 3.1 정기 검증 절차

1. **의존성 목록 관리**
   - `package.json`, `android/app/build.gradle`, `ios/App/Podfile`에 사용 SDK를 문서화
   - 의존성 변경 시 이 문서와 Data Safety 양식을 갱신

2. **SDK별 정책 문서 확인**
   - 각 SDK 공식 사이트에서 개인정보 처리방침, 데이터 수집 범위 확인
   - Google Play 데이터 안전 섹션에 명시된 데이터 유형과 일치 여부 점검

3. **라이선스·개인정보 처리 확인**
   - Apache 2.0, MIT 등 오픈소스 라이선스 준수
   - 개인정보 처리 가능 SDK는 공식 개인정보 처리방침 확인 및 저장

### 3.2 주요 SDK별 확인 방법

| SDK | 확인 방법 |
|-----|-----------|
| **Firebase** | [Firebase 사용 약관](https://firebase.google.com/terms), [Google 개인정보 처리방침](https://policies.google.com/privacy) |
| **Supabase** | [Supabase 개인정보 처리방침](https://supabase.com/privacy), 프로젝트의 데이터 저장·처리 방식 |
| **Toss Payments** | [토스페이먼츠 개인정보 처리방침](https://www.tosspayments.com/company/privacy), 결제 데이터 처리 방식 |
| **LiveKit** | [LiveKit 개인정보 처리방침](https://livekit.io/privacy), 서버 호스팅 위치 및 스트림 처리 |
| **Capacitor 플러그인** | [Capacitor 공식 플러그인](https://capacitorjs.com/docs/plugins), 커뮤니티 플러그인 소스코드 및 이슈 검토 |

### 3.3 Google Play Console Data Safety 입력 시 참고

- **수집 데이터 유형**: 계정 정보, 결제 정보, 사진·동영상, 오디오, 위치(지도 사용 시), 디바이스 식별자 등
- **수집 목적**: 서비스 제공, 인증, 결제, 푸시 알림, 통화, 고객 지원
- **데이터 공유**: 결제·인증·푸시·통화·백엔드에 필요한 서비스 제공자에 한함 (Firebase, Supabase, Toss Payments, LiveKit 등)

---

## 4. 데이터 수집 최소화 원칙

- 수집 목적에 필요한 범위로만 수집
- 푸시 알림: FCM 토큰 및 메시지 페이로드만 사용
- 결제: 카드 번호 등 민감 정보는 PG사(Toss Payments)가 직접 처리
- 통화: LiveKit으로 전달되는 오디오·비디오는 서비스 제공에 필요한 최소 범위
- Firebase Analytics는 사용하지 않으며, FCM만 사용

---

## 5. 문서 갱신

- 의존성 추가·제거·업그레이드 시 이 문서를 갱신합니다.
- Google Play Console Data Safety 양식도 이 문서와 동기화하여 유지합니다.
