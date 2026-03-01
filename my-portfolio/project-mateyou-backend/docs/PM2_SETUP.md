# PM2 설정 가이드

## 문제 상황

서버에서 PM2로 애플리케이션을 실행할 때 다음과 같은 에러가 발생할 수 있습니다:

```
Error: supabaseUrl is required.
```

이것은 PM2가 `.env` 파일의 환경 변수를 자동으로 로드하지 않기 때문입니다.

## 해결 방법

### 1. ecosystem.config.cjs 파일 확인

프로젝트 루트에 `ecosystem.config.cjs` 파일이 있는지 확인하세요. 이 파일은 PM2가 환경 변수를 로드하도록 설정합니다.

**참고**: `package.json`에 `"type": "module"`이 설정되어 있어서 `.cjs` 확장자를 사용합니다.

### 2. 서버에서 실행할 명령어

```bash
# 1. 프로젝트 디렉토리로 이동
cd /home/ubuntu/mateyou-backend

# 2. .env 파일이 있는지 확인
ls -la .env

# 3. .env 파일이 없다면 생성 (로컬에서 복사하거나 직접 작성)
# .env 파일에는 다음 변수들이 필요합니다:
# - SUPABASE_URL
# - SUPABASE_SERVICE_ROLE_KEY
# - SUPABASE_ANON_KEY
# - 기타 필요한 환경 변수들

# 4. 기존 PM2 프로세스 중지 및 삭제
pm2 stop mateyou-backend
pm2 delete mateyou-backend

# 5. ecosystem.config.cjs를 사용하여 PM2 시작
pm2 start ecosystem.config.cjs

# 6. PM2 상태 확인
pm2 status

# 7. 로그 확인
pm2 logs mateyou-backend
```

### 3. .env 파일 예시

`.env` 파일에는 최소한 다음 변수들이 필요합니다:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# Server Configuration
PORT=4000
NODE_ENV=production

# 기타 필요한 환경 변수들...
```

### 4. 대안: 환경 변수를 직접 설정

만약 `ecosystem.config.js`를 사용하지 않고 직접 실행하려면:

```bash
# 환경 변수를 직접 전달
SUPABASE_URL=your-url \
SUPABASE_SERVICE_ROLE_KEY=your-key \
SUPABASE_ANON_KEY=your-anon-key \
pm2 start dist/index.js --name mateyou-backend
```

하지만 이 방법은 권장하지 않습니다. `ecosystem.config.js`를 사용하는 것이 더 안전하고 관리하기 쉽습니다.

### 5. 문제 해결 체크리스트

- [ ] `.env` 파일이 서버에 존재하는가?
- [ ] `.env` 파일에 `SUPABASE_URL`이 설정되어 있는가?
- [ ] `.env` 파일에 `SUPABASE_SERVICE_ROLE_KEY`가 설정되어 있는가?
- [ ] `.env` 파일에 `SUPABASE_ANON_KEY`가 설정되어 있는가?
- [ ] `ecosystem.config.cjs` 파일이 프로젝트 루트에 있는가?
- [ ] PM2가 `ecosystem.config.cjs`를 사용하여 시작되었는가?

### 6. 로그 확인

문제가 계속 발생하면 다음 명령어로 상세한 로그를 확인하세요:

```bash
# 에러 로그만 확인
pm2 logs mateyou-backend --err

# 출력 로그만 확인
pm2 logs mateyou-backend --out

# 모든 로그 확인
pm2 logs mateyou-backend

# 실시간 로그 확인 (마지막 50줄)
pm2 logs mateyou-backend --lines 50
```

