# MateYou Supabase Edge Functions

MateYou 애플리케이션의 Supabase Edge Functions 구현입니다.

## 📁 프로젝트 구조

```
supabase/
├── functions/
│   ├── _shared/           # 공통 유틸리티 및 타입
│   │   ├── types.ts      # 공통 타입 정의
│   │   └── utils.ts      # 공통 헬퍼 함수
│   ├── api-partners/     # 파트너 관련 API
│   │   └── index.ts
│   ├── api-auth/         # 인증 관련 API
│   │   └── index.ts
│   └── api-chat/         # 채팅 관련 API
│       └── index.ts
├── swagger.yaml          # API 문서 (OpenAPI 3.0)
└── README.md            # 이 파일
```

## 🚀 시작하기

### 로컬 개발 환경 설정

1. **Supabase CLI 설치**
   ```bash
   npm install -g supabase
   ```

2. **로컬 Supabase 시작**
   ```bash
   supabase start
   ```

3. **Edge Functions 배포 (로컬)**
   ```bash
   # 모든 함수 배포
   supabase functions deploy

   # 특정 함수 배포
   supabase functions deploy api-partners
   ```

### 프로덕션 배포

1. **Supabase 프로젝트 연결**
   ```bash
   supabase link --project-ref <your-project-ref>
   ```

2. **함수 배포**
   ```bash
   supabase functions deploy --project-ref <your-project-ref>
   ```

## 📚 API 문서

### 인증

모든 보호된 엔드포인트는 Bearer 토큰이 필요합니다:

```bash
Authorization: Bearer <supabase-jwt-token>
```

### API 엔드포인트

#### 🧑‍🤝‍🧑 Partners API (`api-partners`)

- `GET /api-partners/details/{memberCode}` - 멤버 코드로 파트너 상세 정보 조회
- `GET /api-partners/jobs/{memberId}` - 파트너의 작업 목록 조회
- `GET /api-partners/list` - 파트너 목록 조회 (페이지네이션)
- `GET /api-partners/recent` - 최근 파트너 목록 조회

#### 🔐 Auth API (`api-auth`)

- `GET /api-auth/me` - 현재 사용자 정보 조회
- `PUT /api-auth/profile` - 사용자 프로필 업데이트
- `GET /api-auth/partner-status` - 파트너 상태 조회
- `POST /api-auth/partner-apply` - 파트너 신청

#### 💬 Chat API (`api-chat`)

- `GET /api-chat/rooms` - 채팅방 목록 조회
- `POST /api-chat/rooms` - 채팅방 생성 또는 조회
- `GET /api-chat/messages/{roomId}` - 채팅방 메시지 목록 조회
- `POST /api-chat/messages` - 메시지 전송
- `DELETE /api-chat/rooms/{roomId}` - 채팅방 비활성화

### 응답 형식

모든 API 응답은 다음 형식을 따릅니다:

```json
{
  "success": true,
  "data": {...},
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description",
    "details": {...}
  },
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 10
  }
}
```

## 🛠 개발 가이드

### 새로운 Edge Function 추가

1. **디렉토리 생성**
   ```bash
   mkdir supabase/functions/api-new-feature
   ```

2. **index.ts 파일 생성**
   ```typescript
   import { corsHeaders, createSupabaseClient, errorResponse, successResponse } from '../_shared/utils.ts';

   serve(async (req) => {
     if (req.method === 'OPTIONS') {
       return new Response('ok', { headers: corsHeaders });
     }

     try {
       // 로직 구현
       return successResponse({ message: 'Hello World' });
     } catch (error) {
       return errorResponse('INTERNAL_ERROR', 'Something went wrong', error.message, 500);
     }
   });
   ```

3. **배포**
   ```bash
   supabase functions deploy api-new-feature
   ```

### 공통 유틸리티 사용

#### 타입 정의

`_shared/types.ts`에서 공통 타입을 import하여 사용:

```typescript
import type { Member, Partner, ApiResponse } from '../_shared/types.ts';
```

#### 헬퍼 함수

`_shared/utils.ts`에서 공통 함수들을 import하여 사용:

```typescript
import {
  createSupabaseClient,
  successResponse,
  errorResponse,
  getAuthUser,
  corsHeaders
} from '../_shared/utils.ts';
```

### 에러 처리

표준화된 에러 응답을 사용:

```typescript
// 400 Bad Request
return errorResponse('INVALID_INPUT', 'Required field missing');

// 401 Unauthorized
return errorResponse('UNAUTHORIZED', 'Authentication required', null, 401);

// 404 Not Found
return errorResponse('NOT_FOUND', 'Resource not found', null, 404);

// 500 Internal Server Error
return errorResponse('INTERNAL_ERROR', 'Server error', error.message, 500);
```

## 🧪 테스트

### 로컬 테스트

```bash
# 함수 로그 확인
supabase functions logs api-partners

# curl을 사용한 테스트
curl -X GET "http://localhost:54321/functions/v1/api-partners/recent" \
  -H "Authorization: Bearer <token>"
```

### API 문서 확인

Swagger UI를 사용하여 API 문서를 확인할 수 있습니다:

1. [Swagger Editor](https://editor.swagger.io/)에 `swagger.yaml` 파일 내용 복사
2. 또는 로컬에서 Swagger UI 실행

## 🔧 환경 변수

Edge Functions에서 사용하는 환경 변수:

- `SUPABASE_URL` - Supabase 프로젝트 URL
- `SUPABASE_SERVICE_ROLE_KEY` - 서비스 역할 키
- `SUPABASE_ANON_KEY` - 익명 키

## 🐛 디버깅

### 로그 확인

```bash
# 실시간 로그
supabase functions logs api-partners --follow

# 특정 기간의 로그
supabase functions logs api-partners --since=1h
```

### 일반적인 문제

1. **CORS 에러**
   - `corsHeaders`가 올바르게 설정되었는지 확인
   - OPTIONS 메서드 처리가 있는지 확인

2. **인증 에러**
   - JWT 토큰이 올바른지 확인
   - `getAuthUser()` 함수 사용 시 try-catch 처리

3. **타입 에러**
   - TypeScript 타입이 올바르게 정의되었는지 확인
   - `_shared/types.ts`에서 공통 타입 사용

## 📈 성능 최적화

### 데이터베이스 쿼리 최적화

1. **필요한 필드만 선택**
   ```typescript
   .select('id, name, email')  // 모든 필드 대신
   ```

2. **적절한 인덱스 사용**
   - 자주 쿼리되는 필드에 인덱스 추가
   - 복합 인덱스 고려

3. **페이지네이션**
   ```typescript
   .range(offset, offset + limit - 1)
   ```

### 캐싱 전략

1. **클라이언트 사이드**
   - React Query의 `staleTime` 활용
   - 적절한 캐시 키 설정

2. **서버 사이드**
   - 계산이 복잡한 데이터는 캐싱 고려
   - Redis 또는 Supabase의 캐싱 기능 활용

## 🔒 보안

### 데이터 접근 제어

1. **인증된 사용자만 접근**
   ```typescript
   const user = await getAuthUser(req);
   ```

2. **권한 검증**
   ```typescript
   if (roomData.created_by !== user.id && roomData.partner_id !== user.id) {
     return errorResponse('UNAUTHORIZED', 'Access denied', null, 403);
   }
   ```

3. **데이터 마스킹**
   ```typescript
   const maskedName = maskName(review.reviewer_name);
   ```

### 입력 검증

```typescript
if (!body || !body.required_field) {
  return errorResponse('INVALID_INPUT', 'Required field missing');
}
```

## 🚀 배포 전 체크리스트

- [ ] 모든 Edge Functions가 로컬에서 정상 작동
- [ ] 에러 처리가 적절히 구현됨
- [ ] CORS 헤더가 올바르게 설정됨
- [ ] 인증이 필요한 엔드포인트에 보안 검증 추가
- [ ] API 문서 (swagger.yaml) 업데이트
- [ ] 환경 변수가 프로덕션에 올바르게 설정됨
- [ ] 타입 정의가 클라이언트와 일치함

## 📞 지원

문제가 발생하거나 질문이 있는 경우:

1. [Supabase 공식 문서](https://supabase.com/docs/guides/functions) 확인
2. 프로젝트 이슈 트래커에 문제 보고
3. 팀 Slack 채널에서 문의

---

**Last Updated:** 2024-11-09
**Version:** 1.0.0