# Base image
FROM node:20-alpine

# 작업 디렉토리 설정
WORKDIR /app

# package.json 복사 및 모든 의존성 설치 (빌드에 필요)
COPY package*.json ./
RUN npm install

# TypeScript 코드 복사 및 빌드
COPY . .
RUN npm run build

# 프로덕션 의존성만 남기기 (이미지 크기 최적화)
RUN npm prune --production

# 포트 오픈
EXPOSE 4000

# 실행 명령
CMD ["node", "dist/index.js"]
