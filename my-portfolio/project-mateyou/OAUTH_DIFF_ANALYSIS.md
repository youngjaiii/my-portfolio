# OAuth 로그인 관련 변동 사항 분석

## 백업 커밋: `e02be197^` (main 브랜치 통합 전)

---

## 1. `src/store/useAuthStore.ts` 변동 사항

### 변경점:
- **Discord/Twitter 로그인**: `data` 변수를 받도록 변경 (실제로는 사용하지 않음)
- **주석 추가**: `skipBrowserRedirect: false` 주석 추가

### 실제 영향:
- **없음**: 로직상 동일함

---

## 2. `src/routes/__root.tsx` 변동 사항 (핵심)

### A. `handleAppUrl` 함수 변동

**백업 파일:**
- 토큰 추출 후 `setSession` 호출
- 세션 설정 성공 시 `initialize()` → 권한 요청 → 리다이렉트
- 간단한 로그만 사용

**현재 파일:**
- ✅ **추가됨**: `window.location.hash` 설정 로직 (Supabase가 자동으로 처리하도록)
- ✅ **추가됨**: 상세한 로그 (각 단계별)
- ✅ **추가됨**: `router.navigate` 에러 처리 및 경로 확인 로그

**차이점:**
```typescript
// 현재 파일에만 있음:
if (hash && hash.includes('access_token')) {
  console.log('🔧 handleAppUrl: window.location.hash 설정:', hash.substring(0, 50))
  window.location.hash = hash
  await new Promise(resolve => setTimeout(resolve, 500))
}
```

---

### B. `checkInitialUrl` 함수 변동

**백업 파일:**
- 기본적인 해시 확인 및 세션 설정
- 간단한 로그

**현재 파일:**
- ✅ **추가됨**: 전체 URL 체크 로그
- ✅ **추가됨**: URL 파싱 결과 로그
- ✅ **추가됨**: 세션 확인 결과 로그
- ✅ **추가됨**: 인증 상태 확인 과정 로그
- ✅ **추가됨**: 리다이렉트 전/후 경로 확인 로그
- ✅ **추가됨**: `window.location.href`에서 토큰 추출 및 해시 변환 로직

**차이점:**
```typescript
// 현재 파일에만 있음:
const fullUrl = window.location.href
console.log('🔍 checkInitialUrl: 전체 URL 체크:', {...})

if (fullUrl.includes('access_token') && !window.location.hash.includes('access_token')) {
  // URL 파싱 및 해시 변환 로직
  if (hash && hash.includes('access_token')) {
    window.location.hash = hash
  } else if (searchParams.has('access_token')) {
    window.location.hash = `#access_token=...`
  }
}
```

---

### C. `onAuthStateChange` 리스너 변동

**백업 파일:**
```typescript
let isOAuthRedirect = window.location.hash?.includes('access_token') || 
                      window.location.href?.includes('access_token')

// SIGNED_IN 이벤트에서:
const hasOAuthToken = window.location.hash?.includes('access_token')
if (hasOAuthToken) {
  isOAuthRedirect = true
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}
```

**현재 파일:**
- ✅ **추가됨**: `wasAuthenticatedBefore` 변수로 이전 인증 상태 추적
- ✅ **추가됨**: `window.location.href`에서도 토큰 확인
- ✅ **추가됨**: `window.location.href`에 토큰이 있으면 해시로 변환하는 로직
- ✅ **추가됨**: 이전에 인증되지 않았고 현재 인증되었으면 OAuth 리다이렉트로 간주하는 로직
- ✅ **추가됨**: 상세한 로그

**차이점:**
```typescript
// 현재 파일에만 있음:
let wasAuthenticatedBefore = useAuthStore.getState().isAuthenticated

const hasOAuthTokenInHash = window.location.hash?.includes('access_token')
const hasOAuthTokenInHref = window.location.href?.includes('access_token')
const hasOAuthToken = hasOAuthTokenInHash || hasOAuthTokenInHref

// href에만 토큰이 있는 경우 해시로 변환
if (hasOAuthTokenInHref && !hasOAuthTokenInHash) {
  // URL 파싱 및 해시 변환
}

// window.location에 토큰이 없지만 이전에 인증되지 않았고 현재 인증되었으면 OAuth 리다이렉트로 간주
if (!wasAuthenticatedBefore && isCurrentlyAuthenticated && (currentPath === '/login' || currentPath === '/')) {
  isOAuthRedirect = true
}
```

---

### D. 주기적 확인 로직 변동

**백업 파일:**
```typescript
const locationCheckInterval = setInterval(() => {
  if (isProcessing) return
  
  const currentHash = window.location.hash
  const currentHref = window.location.href
  
  if (currentHash.includes('access_token') && !currentHref.includes('oauth_processed')) {
    isProcessing = true
    checkInitialUrl().finally(() => {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      isProcessing = false
    })
  }
}, 1000)
```

**현재 파일:**
- ✅ **추가됨**: `checkCount` 변수로 확인 횟수 추적
- ✅ **추가됨**: `wasAuthenticatedInCheck` 변수로 이전 인증 상태 추적
- ✅ **추가됨**: `oauthRedirectProcessed` 플래그로 중복 처리 방지
- ✅ **추가됨**: 매 5초마다 현재 상태 로그
- ✅ **추가됨**: `window.location.href`에 토큰이 있지만 해시에는 없는 경우 처리
- ✅ **추가됨**: 세션 변화 감지 로직 (이전에 인증되지 않았고 현재 인증되었으면 OAuth 리다이렉트로 간주)

**차이점:**
```typescript
// 현재 파일에만 있음:
let checkCount = 0
let wasAuthenticatedInCheck = useAuthStore.getState().isAuthenticated
let oauthRedirectProcessed = false

// 매 5초마다 현재 상태 로그
if (checkCount % 5 === 0) {
  console.log('🔍 주기적 확인:', {...})
}

// href에 access_token이 있지만 hash에는 없는 경우
if (!currentHash.includes('access_token') && currentHref.includes('access_token') && !currentHref.includes('oauth_processed')) {
  checkInitialUrl().finally(() => {...})
}

// 세션 변화 감지
if (!oauthRedirectProcessed && 
    !wasAuthenticatedInCheck && 
    isCurrentlyAuthenticated && 
    (currentPath === '/login' || currentPath === '/')) {
  // 세션 확인 및 OAuth 리다이렉트 처리
}
```

---

## 3. `src/routes/login.tsx` 변동 사항

### 변경점:
- **없음**: 백업 파일과 동일

---

## 핵심 문제점 분석

### 1. 백업 파일의 핵심 로직 (작동했던 방식)
- `skipBrowserRedirect: false` → Supabase가 자동으로 브라우저 열기
- `onAuthStateChange`에서 `window.location.hash`만 확인
- 간단한 주기적 확인 로직
- **작동 원리**: Supabase가 OAuth URL을 자동으로 외부 브라우저로 열고, 인증 완료 후 `mateyou://auth/callback#access_token=...`로 리다이렉트되면 `appUrlOpen` 이벤트가 트리거되어 처리

### 2. 현재 파일의 문제점
- ✅ **추가된 로직**: `window.location.hash` 설정 로직이 있지만, 실제로는 Supabase가 자동으로 처리하므로 불필요할 수 있음
- ✅ **복잡성 증가**: 많은 로그와 복잡한 로직이 추가되어 디버깅은 쉬워졌지만, 오히려 문제를 일으킬 수 있음
- ⚠️ **세션 변화 감지**: 주기적 확인에서 세션 변화를 감지하는 로직이 추가되었지만, `SIGNED_IN` 이벤트가 발생하지 않으면 작동하지 않을 수 있음

### 3. 실제 문제의 원인 추정
- **"프레임 로드 중단됨" 에러**: Supabase OAuth URL을 WebView에서 열려고 할 때 발생
- **원인**: `skipBrowserRedirect: false`로 설정되어 있어도, 네이티브 환경에서 Supabase가 WebView 내에서 URL을 열려고 시도할 수 있음
- **해결책**: 백업 파일의 간단한 로직으로 되돌리거나, `skipBrowserRedirect: true`로 설정하고 수동으로 외부 브라우저를 열어야 함

---

## 권장 사항

1. **백업 파일의 로직으로 되돌리기**: 가장 간단하고 작동했던 방식
2. **또는**: `skipBrowserRedirect: true`로 설정하고 `window.open()` 또는 Capacitor Browser 플러그인으로 외부 브라우저 열기
3. **로그는 유지하되 로직은 단순화**: 디버깅을 위해 로그는 유지하되, 복잡한 로직은 제거

