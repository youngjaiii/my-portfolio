# API 인증 토큰 발급 가이드

이 문서는 MateYou Backend API를 사용하기 위한 인증 토큰 발급 방법을 설명합니다.

## 🔑 토큰이란?

MateYou Backend API는 **Supabase JWT (JSON Web Token)** 토큰을 사용하여 사용자를 인증합니다. 모든 보호된 엔드포인트는 `Authorization: Bearer <token>` 헤더가 필요합니다.

## 📱 프론트엔드에서 토큰 발급받기

### 1. Supabase 클라이언트 설정

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'YOUR_SUPABASE_URL'
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY'

const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

### 2. 로그인 후 토큰 가져오기

#### 방법 1: signInWithPassword 사용

```typescript
// 로그인
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
})

if (error) {
  console.error('로그인 실패:', error)
  return
}

// 토큰 추출
const token = data.session?.access_token
console.log('Access Token:', token)
```

#### 방법 2: 현재 세션에서 토큰 가져오기

```typescript
// 현재 세션 가져오기
const { data: { session }, error } = await supabase.auth.getSession()

if (error || !session) {
  console.error('세션이 없습니다')
  return
}

const token = session.access_token
console.log('Access Token:', token)
```

#### 방법 3: 회원가입 후 토큰 가져오기

```typescript
// 회원가입
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123',
  options: {
    data: {
      full_name: '홍길동'
    }
  }
})

if (error) {
  console.error('회원가입 실패:', error)
  return
}

// 토큰 추출 (회원가입 직후에는 세션이 있을 수 있음)
const token = data.session?.access_token
```

### 3. 토큰을 로컬 스토리지에 저장 (선택사항)

```typescript
// 토큰 저장
if (token) {
  localStorage.setItem('auth_token', token)
}

// 토큰 불러오기
const savedToken = localStorage.getItem('auth_token')
```

## 🌐 API 요청에 토큰 사용하기

### Fetch API 사용

```typescript
const token = 'YOUR_JWT_TOKEN'

const response = await fetch('http://localhost:4000/api/auth/me', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})

const data = await response.json()
console.log(data)
```

### Axios 사용

```typescript
import axios from 'axios'

const token = 'YOUR_JWT_TOKEN'

const response = await axios.get('http://localhost:4000/api/auth/me', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})

console.log(response.data)
```

### Axios Interceptor로 자동 토큰 추가

```typescript
import axios from 'axios'

// Axios 인스턴스 생성
const apiClient = axios.create({
  baseURL: 'http://localhost:4000',
  headers: {
    'Content-Type': 'application/json'
  }
})

// 요청 인터셉터: 모든 요청에 토큰 자동 추가
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 사용 예시
const response = await apiClient.get('/api/auth/me')
console.log(response.data)
```

## 📚 Swagger UI에서 토큰 사용하기

1. **토큰 발급**: 위의 방법으로 프론트엔드에서 토큰을 발급받습니다.

2. **Swagger UI 접속**: `http://localhost:4000/docs` 접속

3. **토큰 입력**:
   - 우측 상단의 **"Authorize"** 버튼 클릭
   - `bearerAuth` 섹션에서 **"Value"** 필드에 토큰 입력
   - 토큰만 입력하면 됩니다 (Bearer는 자동으로 추가됨)
   - **"Authorize"** 버튼 클릭
   - **"Close"** 버튼 클릭

4. **API 테스트**: 이제 모든 보호된 API를 테스트할 수 있습니다.

## 🔄 토큰 갱신

Supabase 토큰은 만료 시간이 있습니다. 토큰이 만료되면 자동으로 갱신할 수 있습니다:

```typescript
// 세션 갱신
const { data: { session }, error } = await supabase.auth.refreshSession()

if (error) {
  console.error('토큰 갱신 실패:', error)
  // 재로그인 필요
} else {
  const newToken = session?.access_token
  localStorage.setItem('auth_token', newToken)
}
```

## ⚠️ 주의사항

1. **토큰 보안**: 토큰은 민감한 정보입니다. 절대 공개 저장소에 커밋하지 마세요.
2. **토큰 만료**: 토큰은 만료 시간이 있으므로, 만료되면 재발급이 필요합니다.
3. **HTTPS 사용**: 프로덕션 환경에서는 반드시 HTTPS를 사용하세요.
4. **토큰 저장**: 로컬 스토리지에 저장할 경우 XSS 공격에 주의하세요.

## 🧪 테스트용 토큰 발급 (개발 환경)

개발 환경에서 빠르게 테스트하려면:

```typescript
// Supabase 대시보드에서 직접 토큰 생성하거나
// 또는 테스트 계정으로 로그인하여 토큰 발급

const testEmail = 'test@example.com'
const testPassword = 'test123'

const { data } = await supabase.auth.signInWithPassword({
  email: testEmail,
  password: testPassword
})

const testToken = data.session?.access_token
console.log('테스트 토큰:', testToken)
```

## 📞 문제 해결

### 토큰이 작동하지 않는 경우

1. **토큰 형식 확인**: `Bearer <token>` 형식인지 확인
2. **토큰 만료 확인**: 토큰이 만료되었는지 확인
3. **헤더 확인**: `Authorization` 헤더가 올바르게 설정되었는지 확인
4. **CORS 확인**: 프론트엔드에서 요청 시 CORS 오류가 없는지 확인

### 에러 메시지

- `UNAUTHORIZED`: 토큰이 없거나 유효하지 않음
- `Invalid token`: 토큰 형식이 잘못되었거나 만료됨
- `No authorization header`: Authorization 헤더가 없음

## 🔗 관련 링크

- [Supabase Auth 문서](https://supabase.com/docs/guides/auth)
- [JWT 토큰 설명](https://jwt.io/introduction)
- [Swagger UI 문서](https://swagger.io/tools/swagger-ui/)

