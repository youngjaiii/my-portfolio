# 배너 생성 및 파일 업로드 테스트 명령어

## 사전 준비
1. 서버가 실행 중이어야 합니다 (`npm run dev` 또는 `npm run start`)
2. 관리자 권한이 있는 인증 토큰이 필요합니다

## 테스트 순서

### 1. 파일 업로드 테스트

```bash
# 이미지 파일이 있는 경우
curl -X POST 'http://localhost:4000/api/storage/upload' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -F 'file=@/path/to/your/image.jpg' \
  -F 'bucket=ad-images' \
  -F 'path=admin/test-image.jpg' \
  -F 'upsert=true'

# 또는 실제 API URL 사용
curl -X POST 'https://api.mateyou.me/api/storage/upload' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -F 'file=@/path/to/your/image.jpg' \
  -F 'bucket=ad-images' \
  -F 'path=admin/test-image.jpg' \
  -F 'upsert=true'
```

**성공 응답 예시:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "File uploaded successfully",
    "path": "admin/test-image.jpg",
    "url": "https://rmooqijhkmomdtkvuzrr.supabase.co/storage/v1/object/public/ad-images/admin/test-image.jpg",
    "bucket": "ad-images",
    "size": 123456,
    "contentType": "image/jpeg"
  }
}
```

### 2. 배너 생성 테스트

```bash
# 1단계에서 받은 이미지 URL을 사용
curl -X POST 'http://localhost:4000/api/admin/banners' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "테스트 배너",
    "description": "테스트용 배너입니다",
    "image_url": "https://rmooqijhkmomdtkvuzrr.supabase.co/storage/v1/object/public/ad-images/admin/test-image.jpg",
    "link_url": "https://example.com",
    "is_active": true
  }'

# 또는 실제 API URL 사용
curl -X POST 'https://api.mateyou.me/api/admin/banners' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "테스트 배너",
    "description": "테스트용 배너입니다",
    "image_url": "https://rmooqijhkmomdtkvuzrr.supabase.co/storage/v1/object/public/ad-images/admin/test-image.jpg",
    "link_url": "https://example.com",
    "is_active": true
  }'
```

**성공 응답 예시:**
```json
{
  "success": true,
  "data": {
    "banner": {
      "id": "uuid-here",
      "title": "테스트 배너",
      "description": "테스트용 배너입니다",
      "background_image": "https://rmooqijhkmomdtkvuzrr.supabase.co/storage/v1/object/public/ad-images/admin/test-image.jpg",
      "link_url": "https://example.com",
      "is_active": true,
      "created_at": "2025-01-27T...",
      "updated_at": "2025-01-27T..."
    },
    "message": "Banner created successfully"
  }
}
```

### 3. 배너 조회 테스트

```bash
curl -X GET 'http://localhost:4000/api/admin/banners' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'

# 또는 실제 API URL 사용
curl -X GET 'https://api.mateyou.me/api/admin/banners' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'
```

### 4. 배너 수정 테스트

```bash
curl -X PUT 'http://localhost:4000/api/admin/banners/BANNER_ID' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "수정된 배너 제목",
    "is_active": false
  }'
```

## 빠른 테스트 (한 번에)

```bash
# 환경 변수 설정
export API_URL="https://api.mateyou.me"  # 또는 "http://localhost:4000"
export AUTH_TOKEN="YOUR_AUTH_TOKEN"
export IMAGE_PATH="/path/to/image.jpg"

# 1. 파일 업로드
UPLOAD_RESPONSE=$(curl -s -X POST "$API_URL/api/storage/upload" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -F "file=@$IMAGE_PATH" \
  -F "bucket=ad-images" \
  -F "path=admin/$(date +%s)-test.jpg" \
  -F "upsert=true")

echo "업로드 응답: $UPLOAD_RESPONSE"

# 2. 이미지 URL 추출 (jq가 설치되어 있는 경우)
IMAGE_URL=$(echo $UPLOAD_RESPONSE | jq -r '.data.url')

# 3. 배너 생성
curl -X POST "$API_URL/api/admin/banners" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"테스트 배너 $(date +%H:%M:%S)\",
    \"image_url\": \"$IMAGE_URL\",
    \"link_url\": \"https://example.com\",
    \"is_active\": true
  }"
```

## 주의사항

1. **인증 토큰**: 관리자 권한이 있는 토큰이 필요합니다
2. **파일 크기**: 10MB 이하의 이미지 파일만 업로드 가능합니다
3. **파일 형식**: 이미지 파일만 업로드 가능합니다 (jpeg, png, gif, webp 등)
4. **버킷 이름**: `ad-images` 버킷이 Supabase에 생성되어 있어야 합니다

## 에러 해결

### "File upload requires multer middleware configuration"
- ✅ 이미 수정 완료: multer가 설치되고 구현되었습니다

### "Could not find the 'image_url' column"
- ✅ 이미 수정 완료: `image_url`이 `background_image`로 매핑됩니다

### "Only image files are allowed"
- 이미지 파일만 업로드 가능합니다. 다른 형식의 파일은 업로드할 수 없습니다

### "File size limit exceeded"
- 파일 크기가 10MB를 초과하면 업로드할 수 없습니다

